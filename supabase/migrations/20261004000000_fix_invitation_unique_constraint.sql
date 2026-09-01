DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.shop_invitations'::regclass
          AND contype = 'u'
    ) LOOP
        EXECUTE 'ALTER TABLE public.shop_invitations DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Only one active invitation allowed per phone in a shop
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_invitation 
ON public.shop_invitations (shop_id, phone) 
WHERE status IN ('pending', 'accepted');
