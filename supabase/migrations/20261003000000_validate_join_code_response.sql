-- Drop the old boolean-returning function
DROP FUNCTION IF EXISTS public.validate_join_code(TEXT, TEXT);

-- Recreate with JSONB return type
CREATE OR REPLACE FUNCTION public.validate_join_code(p_phone TEXT, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_exists BOOLEAN;
BEGIN
  -- We just check if a valid pending invite exists. No auth required to check this.
  IF EXISTS (
    SELECT 1 FROM public.shop_invitations
    WHERE phone = p_phone
      AND join_code = p_code
      AND status = 'pending'
      AND expires_at > now()
  ) THEN
    -- Check if user exists
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE phone = p_phone) INTO v_user_exists;
    RETURN jsonb_build_object('valid', true, 'user_exists', v_user_exists);
  END IF;

  RETURN jsonb_build_object('valid', false, 'user_exists', false);
END $$;
