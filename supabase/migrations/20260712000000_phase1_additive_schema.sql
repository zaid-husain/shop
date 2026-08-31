-- Phase 1: Additive Schema Changes
-- DO NOT modify or drop legacy `ledger_entries` in this phase.

-- 1. Create idempotent_requests table
CREATE TABLE IF NOT EXISTS public.idempotent_requests (
    idempotency_key UUID PRIMARY KEY,
    shop_id UUID NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    result_reference_id UUID,
    processing_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.idempotent_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_isolation_idempotent_requests" ON public.idempotent_requests
    FOR ALL USING (shop_id = public.current_shop_id()) WITH CHECK (shop_id = public.current_shop_id());

-- 2. Create inventory_movements table (Append-Only)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    movement_type VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    reference_id UUID,
    idempotency_key UUID UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_isolation_inventory_movements_select" ON public.inventory_movements
    FOR SELECT USING (shop_id = public.current_shop_id());
CREATE POLICY "shop_isolation_inventory_movements_insert" ON public.inventory_movements
    FOR INSERT WITH CHECK (shop_id = public.current_shop_id());
-- NO UPDATE OR DELETE POLICIES (Append-Only)

-- 3. Create payments table (Append-Only)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL,
    reference_id UUID,
    idempotency_key UUID UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_isolation_payments_select" ON public.payments
    FOR SELECT USING (shop_id = public.current_shop_id());
CREATE POLICY "shop_isolation_payments_insert" ON public.payments
    FOR INSERT WITH CHECK (shop_id = public.current_shop_id());

-- 4. Create ledger_transactions table (Append-Only)
CREATE TABLE IF NOT EXISTS public.ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(50) NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    balance_impact NUMERIC(12,2) NOT NULL,
    reference_id UUID,
    idempotency_key UUID UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_isolation_ledger_transactions_select" ON public.ledger_transactions
    FOR SELECT USING (shop_id = public.current_shop_id());
CREATE POLICY "shop_isolation_ledger_transactions_insert" ON public.ledger_transactions
    FOR INSERT WITH CHECK (shop_id = public.current_shop_id());

-- 5. Modify existing tables safely
ALTER TABLE public.customers 
    ADD COLUMN IF NOT EXISTS balance_cache NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.products 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.invoices 
    ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid',
    ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS customer_name_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS customer_mobile_snapshot VARCHAR(50);

-- Revoke ordinary DELETE on financial tables
REVOKE DELETE ON public.invoices FROM authenticated;
REVOKE UPDATE ON public.invoices FROM authenticated; -- Finalized invoices should not be updated loosely.

-- 6. RPC: create_sale
CREATE OR REPLACE FUNCTION public.create_sale(
    p_idempotency_key UUID,
    p_request_hash VARCHAR,
    p_shop_id UUID,
    p_customer_id UUID,
    p_invoice_number VARCHAR,
    p_cost_total NUMERIC,
    p_discount NUMERIC,
    p_total NUMERIC,
    p_paid NUMERIC,
    p_due NUMERIC,
    p_notes TEXT,
    p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_shop_valid BOOLEAN;
    v_invoice_id UUID;
    v_item RECORD;
BEGIN
    -- 1. Security Check
    v_uid := auth.uid();
    SELECT EXISTS (
        SELECT 1 FROM profiles WHERE id = v_uid AND shop_id = p_shop_id
    ) INTO v_shop_valid;
    
    IF NOT v_shop_valid THEN
        RAISE EXCEPTION 'Unauthorized: User does not belong to shop_id %', p_shop_id;
    END IF;

    -- 2. Idempotency Check
    IF EXISTS (SELECT 1 FROM idempotent_requests WHERE idempotency_key = p_idempotency_key) THEN
        IF EXISTS (SELECT 1 FROM idempotent_requests WHERE idempotency_key = p_idempotency_key AND request_hash = p_request_hash) THEN
            SELECT result_reference_id INTO v_invoice_id FROM idempotent_requests WHERE idempotency_key = p_idempotency_key;
            RETURN jsonb_build_object('status', 'success', 'invoice_id', v_invoice_id, 'replayed', true);
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSE_MISMATCH';
        END IF;
    END IF;

    -- 3. Lock idempotency key
    INSERT INTO idempotent_requests (idempotency_key, shop_id, operation_type, request_hash, processing_status)
    VALUES (p_idempotency_key, p_shop_id, 'CREATE_SALE', p_request_hash, 'PENDING');

    -- 4. Create Invoice
    INSERT INTO invoices (shop_id, customer_id, invoice_number, cost_total, discount, paid, due, total, notes, payment_status, created_by, idempotency_key)
    VALUES (p_shop_id, p_customer_id, p_invoice_number, p_cost_total, p_discount, p_paid, p_due, p_total, p_notes, 
            CASE WHEN p_due <= 0 THEN 'paid' WHEN p_paid > 0 THEN 'partial' ELSE 'unpaid' END, v_uid, p_idempotency_key)
    RETURNING id INTO v_invoice_id;

    -- 5. Items and Inventory
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT, unit_price NUMERIC, line_total NUMERIC, product_name VARCHAR)
    LOOP
        INSERT INTO invoice_items (shop_id, invoice_id, product_id, product_name, quantity, unit_price, line_total)
        VALUES (p_shop_id, v_invoice_id, v_item.product_id, v_item.product_name, v_item.quantity, v_item.unit_price, v_item.line_total);
        
        IF v_item.product_id IS NOT NULL THEN
            INSERT INTO inventory_movements (shop_id, product_id, movement_type, quantity, reference_id, idempotency_key)
            VALUES (p_shop_id, v_item.product_id, 'SALE', -v_item.quantity, v_invoice_id, gen_random_uuid());
        END IF;
    END LOOP;

    -- 6. Financial Ledger & Payments
    IF p_due > 0 THEN
        INSERT INTO ledger_transactions (shop_id, customer_id, transaction_type, amount, balance_impact, reference_id, idempotency_key)
        VALUES (p_shop_id, p_customer_id, 'CREDIT_SALE', p_due, p_due, v_invoice_id, gen_random_uuid());
    END IF;

    IF p_paid > 0 THEN
        INSERT INTO payments (shop_id, customer_id, amount, payment_method, reference_id, idempotency_key)
        VALUES (p_shop_id, p_customer_id, p_paid, 'CASH', v_invoice_id, gen_random_uuid());
        
        -- Although a direct cash sale doesn't impact khata balance, we might want a 'PAYMENT_APPLIED' if it's paying off due.
        -- For a direct sale, we skip ledger_transaction if it's entirely cash, or log it neutralizing.
        -- We will adhere to standard: only Khata payments (due > 0 previously) need ledger transactions to reduce due.
    END IF;

    -- Update balance cache safely (derived)
    UPDATE customers SET balance_cache = (
        SELECT COALESCE(SUM(balance_impact), 0) FROM ledger_transactions WHERE customer_id = p_customer_id
    ) WHERE id = p_customer_id;

    -- Update Idempotency Request
    UPDATE idempotent_requests 
    SET result_reference_id = v_invoice_id, processing_status = 'COMPLETED'
    WHERE idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object('status', 'success', 'invoice_id', v_invoice_id, 'replayed', false);
END;
$$;
