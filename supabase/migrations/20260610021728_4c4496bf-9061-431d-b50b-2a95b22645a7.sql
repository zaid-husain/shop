
-- 1) Remove broad profile SELECT that leaked pin_hash across shop members
DROP POLICY IF EXISTS "owner reads shop profiles" ON public.profiles;

-- 2) Prevent forged audit_log entries: enforce user_id = auth.uid() on INSERT
DROP POLICY IF EXISTS "members insert audit" ON public.audit_log;
CREATE POLICY "members insert audit" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    shop_id = public.current_shop_id()
    AND user_id = auth.uid()
  );

-- 3) Revoke direct EXECUTE on SECURITY DEFINER helpers from client roles.
-- RLS policy expressions still evaluate these (run as table owner), but
-- signed-in users can no longer invoke them via the API.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_shop_id() FROM PUBLIC, anon, authenticated;
