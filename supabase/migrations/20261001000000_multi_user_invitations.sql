-- Add manager role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

-- Create shop_invitations table
CREATE TABLE public.shop_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  phone TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'staff',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent multiple active invitations for the same phone in the same shop
  UNIQUE (shop_id, phone, status)
);

-- Enable RLS
ALTER TABLE public.shop_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Shop owners/managers can read invitations for their shop
CREATE POLICY "shop members read invitations" ON public.shop_invitations
  FOR SELECT TO authenticated
  USING (shop_id = public.current_shop_id());

-- Note: We do not allow direct INSERT/UPDATE/DELETE.
-- All mutations must go through strict Security Definer RPCs to ensure authorization.

-- RPC: Invite User
CREATE OR REPLACE FUNCTION public.invite_user(p_phone TEXT, p_role public.app_role)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop_id UUID;
  v_inviter_role public.app_role;
  v_new_invite_id UUID;
BEGIN
  -- 1. Get caller's shop_id and role
  SELECT shop_id, role INTO v_shop_id, v_inviter_role 
  FROM public.user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'Caller is not a member of any shop';
  END IF;

  -- 2. Authorization: Only owners or managers can invite
  IF v_inviter_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only owners and managers can invite new members';
  END IF;

  -- 3. Check if phone is already a member of this shop
  IF EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.user_roles ur ON p.id = ur.user_id
    WHERE p.shop_id = v_shop_id AND p.phone = p_phone
  ) THEN
    RAISE EXCEPTION 'User with this phone number is already a member of this shop';
  END IF;

  -- 4. Cancel any existing pending invitations for this phone in this shop
  UPDATE public.shop_invitations
  SET status = 'cancelled', updated_at = now()
  WHERE shop_id = v_shop_id AND phone = p_phone AND status = 'pending';

  -- 5. Create new invitation
  INSERT INTO public.shop_invitations (shop_id, phone, role, status, invited_by)
  VALUES (v_shop_id, p_phone, p_role, 'pending', auth.uid())
  RETURNING id INTO v_new_invite_id;

  RETURN v_new_invite_id;
END $$;

-- RPC: Cancel Invitation
CREATE OR REPLACE FUNCTION public.cancel_invitation(p_invite_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop_id UUID;
  v_inviter_role public.app_role;
BEGIN
  SELECT shop_id, role INTO v_shop_id, v_inviter_role 
  FROM public.user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  IF v_inviter_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Not authorized to cancel invitations';
  END IF;

  UPDATE public.shop_invitations
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_invite_id AND shop_id = v_shop_id AND status = 'pending';

  RETURN FOUND;
END $$;

-- RPC: Remove Member
CREATE OR REPLACE FUNCTION public.remove_member(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop_id UUID;
  v_caller_role public.app_role;
  v_target_role public.app_role;
BEGIN
  SELECT shop_id, role INTO v_shop_id, v_caller_role 
  FROM public.user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  IF v_caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Not authorized to remove members';
  END IF;

  -- Get target user's role in the same shop
  SELECT role INTO v_target_role
  FROM public.user_roles
  WHERE user_id = p_user_id AND shop_id = v_shop_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this shop';
  END IF;

  -- Owner cannot be removed by a manager
  IF v_target_role = 'owner' AND v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'Managers cannot remove owners';
  END IF;

  -- Cannot remove yourself via this function
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself using this function';
  END IF;

  -- Delete from profiles (which cascades to user_roles due to FK if we had one, 
  -- but we should delete both to be safe. Actually, auth.users isn't deleted, 
  -- just their membership. Wait, profiles ID references auth.users(id) ON DELETE CASCADE.
  -- If we just delete the profile and user_roles, they lose access to the shop.)
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND shop_id = v_shop_id;
  DELETE FROM public.profiles WHERE id = p_user_id AND shop_id = v_shop_id;

  -- (Note: Since this is an offline-first system, their local IndexedDB will fail 
  -- syncing next time. This is correct.)

  RETURN TRUE;
END $$;


-- TRIGGER: Smart Signup (handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone TEXT := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  v_name TEXT := COALESCE(NEW.raw_user_meta_data->>'full_name', 'Shop Owner');
  v_invitation RECORD;
  v_shop_id UUID;
  v_role public.app_role;
BEGIN
  -- Check for a valid, pending invitation for this phone number
  SELECT * INTO v_invitation
  FROM public.shop_invitations
  WHERE phone = v_phone 
    AND status = 'pending' 
    AND expires_at > now()
  ORDER BY created_at DESC 
  LIMIT 1;

  IF FOUND THEN
    -- Invitation found! Join the existing shop.
    v_shop_id := v_invitation.shop_id;
    v_role := v_invitation.role;

    -- Mark invitation as accepted
    UPDATE public.shop_invitations 
    SET status = 'accepted', updated_at = now() 
    WHERE id = v_invitation.id;
  ELSE
    -- No invitation found. Create a brand new independent shop.
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
