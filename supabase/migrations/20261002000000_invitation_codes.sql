-- Add join_code column
ALTER TABLE public.shop_invitations 
ADD COLUMN join_code TEXT UNIQUE;

-- Function to generate a random 8-character code starting with BAP
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'BAP' || upper(substr(md5(random()::text), 1, 5));
$$;

-- Replace invite_user to generate and insert join_code
CREATE OR REPLACE FUNCTION public.invite_user(p_phone TEXT, p_role public.app_role)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop_id UUID;
  v_inviter_role public.app_role;
  v_new_invite_id UUID;
  v_join_code TEXT;
BEGIN
  -- 1. Get caller's shop_id and role
  SELECT shop_id, role INTO v_shop_id, v_inviter_role 
  FROM public.user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'Caller is not a member of any shop';
  END IF;

  -- 2. Authorization
  IF v_inviter_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only owners and managers can invite new members';
  END IF;

  -- 3. Check if phone is already a member
  IF EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.user_roles ur ON p.id = ur.user_id
    WHERE p.shop_id = v_shop_id AND p.phone = p_phone
  ) THEN
    RAISE EXCEPTION 'User with this phone number is already a member of this shop';
  END IF;

  -- 4. Cancel existing pending invitations
  UPDATE public.shop_invitations
  SET status = 'cancelled', updated_at = now()
  WHERE shop_id = v_shop_id AND phone = p_phone AND status = 'pending';

  -- 5. Generate unique join code
  LOOP
    v_join_code := public.generate_join_code();
    BEGIN
      INSERT INTO public.shop_invitations (shop_id, phone, role, status, invited_by, join_code)
      VALUES (v_shop_id, p_phone, p_role, 'pending', auth.uid(), v_join_code)
      RETURNING id INTO v_new_invite_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- If by rare chance it's a duplicate code, loop again
    END;
  END LOOP;

  RETURN v_new_invite_id;
END $$;


-- RPC: Validate Join Code (Anonymous accessible)
CREATE OR REPLACE FUNCTION public.validate_join_code(p_phone TEXT, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- We just check if a valid pending invite exists. No auth required to check this.
  IF EXISTS (
    SELECT 1 FROM public.shop_invitations
    WHERE phone = p_phone
      AND join_code = p_code
      AND status = 'pending'
      AND expires_at > now()
  ) THEN
    RETURN TRUE;
  END IF;

  -- Do not reveal if it's expired vs wrong code. Keep it generic for brute force protection.
  RAISE EXCEPTION 'Invalid or expired join code.';
END $$;


-- RPC: Accept Invitation (For authenticated users changing shops)
CREATE OR REPLACE FUNCTION public.accept_invitation(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone TEXT;
  v_invitation RECORD;
BEGIN
  -- Get the current authenticated user's phone number
  SELECT phone INTO v_phone FROM public.profiles WHERE id = auth.uid();
  
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'User profile not found or phone number missing';
  END IF;

  -- Find the invitation
  SELECT * INTO v_invitation
  FROM public.shop_invitations
  WHERE phone = v_phone
    AND join_code = p_code
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE; -- lock row to prevent race conditions

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired join code.';
  END IF;

  -- Attach user to the new shop
  UPDATE public.profiles 
  SET shop_id = v_invitation.shop_id 
  WHERE id = auth.uid();

  -- Replace user roles
  DELETE FROM public.user_roles WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, shop_id, role)
  VALUES (auth.uid(), v_invitation.shop_id, v_invitation.role);

  -- Mark accepted
  UPDATE public.shop_invitations
  SET status = 'accepted', updated_at = now()
  WHERE id = v_invitation.id;

  RETURN TRUE;
END $$;


-- Replace handle_new_user to use join_code if provided
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone TEXT := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  v_name TEXT := COALESCE(NEW.raw_user_meta_data->>'full_name', 'Shop Owner');
  v_provided_code TEXT := NEW.raw_user_meta_data->>'join_code';
  v_invitation RECORD;
  v_shop_id UUID;
  v_role public.app_role;
BEGIN
  IF v_provided_code IS NOT NULL AND v_provided_code != '' THEN
    -- User explicitly tried to join via a code. Verify it!
    SELECT * INTO v_invitation
    FROM public.shop_invitations
    WHERE phone = v_phone 
      AND join_code = v_provided_code
      AND status = 'pending' 
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
      -- Block the signup if they provided a bad code!
      RAISE EXCEPTION 'Invalid or expired join code provided during signup.';
    END IF;

    -- Valid code. Join the shop.
    v_shop_id := v_invitation.shop_id;
    v_role := v_invitation.role;

    -- Mark invitation as accepted
    UPDATE public.shop_invitations 
    SET status = 'accepted', updated_at = now() 
    WHERE id = v_invitation.id;

  ELSE
    -- No code provided. Normal signup -> Create independent shop.
    v_shop_id := gen_random_uuid();
    v_role := 'owner';
  END IF;

  -- Create the profile linked to the determined shop_id
  INSERT INTO public.profiles (id, shop_id, full_name, phone)
  VALUES (NEW.id, v_shop_id, v_name, v_phone);
  
  -- Assign the determined role
  INSERT INTO public.user_roles (user_id, role, shop_id)
  VALUES (NEW.id, v_role, v_shop_id);

  RETURN NEW;
END $$;
