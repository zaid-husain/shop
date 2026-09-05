-- Migration: Fix ledger transactions delete, update, RLS permissions, and atomic RPCs

-- 0. Ensure current_user_role function exists
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles 
  WHERE user_id = auth.uid() AND shop_id = public.current_shop_id() 
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
-- 1. Create atomic RPC for deleting a manual ledger entry
CREATE OR REPLACE FUNCTION public.delete_manual_ledger_entry(
    p_transaction_id UUID,
    p_shop_id UUID,
    p_customer_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_shop_valid BOOLEAN;
    v_role public.app_role;
    v_deleted_count INT;
    v_new_balance NUMERIC;
BEGIN
    -- 1. Security Check
    v_uid := auth.uid();
    SELECT EXISTS (
        SELECT 1 FROM profiles WHERE id = v_uid AND shop_id = p_shop_id
    ) INTO v_shop_valid;
    
    IF NOT v_shop_valid THEN
        RAISE EXCEPTION 'Unauthorized: User does not belong to shop_id %', p_shop_id;
    END IF;

    -- Check role: owner or manager
    SELECT role INTO v_role FROM user_roles WHERE user_id = v_uid AND shop_id = p_shop_id LIMIT 1;
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Forbidden: Only owners and managers can delete ledger entries';
    END IF;

    -- 2. Delete the transaction
    DELETE FROM public.ledger_transactions 
    WHERE id = p_transaction_id AND shop_id = p_shop_id AND customer_id = p_customer_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count = 0 THEN
        RAISE EXCEPTION 'Entry not found or already deleted';
    END IF;

    -- 3. Atomically recalculate and update customer balance cache
    SELECT COALESCE(SUM(balance_impact), 0) INTO v_new_balance 
    FROM public.ledger_transactions 
    WHERE customer_id = p_customer_id AND shop_id = p_shop_id;

    UPDATE public.customers 
    SET balance_cache = v_new_balance, updated_at = NOW() 
    WHERE id = p_customer_id AND shop_id = p_shop_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'transaction_id', p_transaction_id,
        'new_balance', v_new_balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_manual_ledger_entry(UUID, UUID, UUID) TO authenticated;


-- 2. Create atomic RPC for updating a manual ledger entry
CREATE OR REPLACE FUNCTION public.update_manual_ledger_entry(
    p_transaction_id UUID,
    p_shop_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC,
    p_notes TEXT,
    p_receipt_url TEXT DEFAULT NULL,
    p_payment_due_date TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_shop_valid BOOLEAN;
    v_role public.app_role;
    v_updated_count INT;
    v_new_balance NUMERIC;
BEGIN
    -- 1. Security Check
    v_uid := auth.uid();
    SELECT EXISTS (
        SELECT 1 FROM profiles WHERE id = v_uid AND shop_id = p_shop_id
    ) INTO v_shop_valid;
    
    IF NOT v_shop_valid THEN
        RAISE EXCEPTION 'Unauthorized: User does not belong to shop_id %', p_shop_id;
    END IF;

    IF p_amount = 0 THEN
        RAISE EXCEPTION 'Amount cannot be zero';
    END IF;

    -- Check role: owner or manager
    SELECT role INTO v_role FROM user_roles WHERE user_id = v_uid AND shop_id = p_shop_id LIMIT 1;
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Forbidden: Only owners and managers can update ledger entries';
    END IF;

    -- 2. Update the transaction
    UPDATE public.ledger_transactions 
    SET 
        amount = ABS(p_amount),
        balance_impact = p_amount,
        note = NULLIF(TRIM(p_notes), ''),
        receipt_url = p_receipt_url,
        payment_due_date = p_payment_due_date,
        updated_at = NOW()
    WHERE id = p_transaction_id AND shop_id = p_shop_id AND customer_id = p_customer_id;
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
        RAISE EXCEPTION 'Entry not found or already deleted';
    END IF;

    -- 3. Recalculate customer balance cache
    SELECT COALESCE(SUM(balance_impact), 0) INTO v_new_balance 
    FROM public.ledger_transactions 
    WHERE customer_id = p_customer_id AND shop_id = p_shop_id;

    UPDATE public.customers 
    SET balance_cache = v_new_balance, updated_at = NOW() 
    WHERE id = p_customer_id AND shop_id = p_shop_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'transaction_id', p_transaction_id,
        'new_balance', v_new_balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_manual_ledger_entry(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;


-- 3. Update RLS policies to permit both owners and managers to UPDATE and DELETE ledger transactions
DROP POLICY IF EXISTS "owners update ledger" ON public.ledger_transactions;
DROP POLICY IF EXISTS "managers update ledger" ON public.ledger_transactions;
CREATE POLICY "managers update ledger" ON public.ledger_transactions 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "owners delete ledger" ON public.ledger_transactions;
DROP POLICY IF EXISTS "managers delete ledger" ON public.ledger_transactions;
CREATE POLICY "managers delete ledger" ON public.ledger_transactions 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));

-- Legacy table policies if present
DROP POLICY IF EXISTS "owners update ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "managers update ledger entries" ON public.ledger_entries;
CREATE POLICY "managers update ledger entries" ON public.ledger_entries 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "owners delete ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "managers delete ledger entries" ON public.ledger_entries;
CREATE POLICY "managers delete ledger entries" ON public.ledger_entries 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
