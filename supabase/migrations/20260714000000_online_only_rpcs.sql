-- 20260714000000_online_only_rpcs.sql

-- 1. receive_payment
CREATE OR REPLACE FUNCTION public.receive_payment(
    p_idempotency_key UUID,
    p_request_hash VARCHAR,
    p_shop_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC,
    p_payment_method VARCHAR,
    p_notes TEXT,
    p_invoice_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_shop_valid BOOLEAN;
    v_payment_id UUID;
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
            SELECT result_reference_id INTO v_payment_id FROM idempotent_requests WHERE idempotency_key = p_idempotency_key;
            RETURN jsonb_build_object('status', 'success', 'payment_id', v_payment_id, 'replayed', true);
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSE_MISMATCH';
        END IF;
    END IF;

    -- 3. Lock idempotency key
    INSERT INTO idempotent_requests (idempotency_key, shop_id, operation_type, request_hash, processing_status)
    VALUES (p_idempotency_key, p_shop_id, 'RECEIVE_PAYMENT', p_request_hash, 'PENDING');

    -- 4. Create Payment
    INSERT INTO payments (shop_id, customer_id, amount, payment_method, reference_id, idempotency_key)
    VALUES (p_shop_id, p_customer_id, p_amount, p_payment_method, p_invoice_id, p_idempotency_key)
    RETURNING id INTO v_payment_id;

    -- 5. Financial Ledger
    -- A payment reduces the customer's balance (negative balance impact)
    INSERT INTO ledger_transactions (shop_id, customer_id, transaction_type, amount, balance_impact, reference_id, idempotency_key, note)
    VALUES (p_shop_id, p_customer_id, 'PAYMENT', p_amount, -p_amount, v_payment_id, gen_random_uuid(), p_notes);

    -- 6. Update Invoice if linked
    IF p_invoice_id IS NOT NULL THEN
        -- Adjust invoice due/paid
        UPDATE invoices 
        SET 
            paid = paid + p_amount,
            due = GREATEST(due - p_amount, 0),
            payment_status = CASE WHEN (due - p_amount) <= 0 THEN 'paid' ELSE 'partial' END
        WHERE id = p_invoice_id AND shop_id = p_shop_id;
    END IF;

    -- 7. Update balance cache safely (derived)
    UPDATE customers SET balance_cache = (
        SELECT COALESCE(SUM(balance_impact), 0) FROM ledger_transactions WHERE customer_id = p_customer_id
    ) WHERE id = p_customer_id;

    -- 8. Update Idempotency Request
    UPDATE idempotent_requests 
    SET result_reference_id = v_payment_id, processing_status = 'COMPLETED'
    WHERE idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object('status', 'success', 'payment_id', v_payment_id, 'replayed', false);
END;
$$;


-- 2. create_purchase
CREATE OR REPLACE FUNCTION public.create_purchase(
    p_idempotency_key UUID,
    p_request_hash VARCHAR,
    p_shop_id UUID,
    p_supplier_id UUID,
    p_bill_number VARCHAR,
    p_bill_date DATE,
    p_subtotal NUMERIC,
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
    v_purchase_id UUID;
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
            SELECT result_reference_id INTO v_purchase_id FROM idempotent_requests WHERE idempotency_key = p_idempotency_key;
            RETURN jsonb_build_object('status', 'success', 'purchase_id', v_purchase_id, 'replayed', true);
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSE_MISMATCH';
        END IF;
    END IF;

    -- 3. Lock idempotency key
    INSERT INTO idempotent_requests (idempotency_key, shop_id, operation_type, request_hash, processing_status)
    VALUES (p_idempotency_key, p_shop_id, 'CREATE_PURCHASE', p_request_hash, 'PENDING');

    -- 4. Create Purchase
    INSERT INTO purchases (shop_id, supplier_id, bill_number, bill_date, subtotal, discount, paid, due, total, notes, created_by)
    VALUES (p_shop_id, p_supplier_id, p_bill_number, p_bill_date, p_subtotal, p_discount, p_paid, p_due, p_total, p_notes, v_uid)
    RETURNING id INTO v_purchase_id;

    -- 5. Items and Inventory
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT, unit_cost NUMERIC, line_total NUMERIC, product_name VARCHAR)
    LOOP
        INSERT INTO purchase_items (shop_id, purchase_id, product_id, product_name, quantity, unit_cost, line_total)
        VALUES (p_shop_id, v_purchase_id, v_item.product_id, v_item.product_name, v_item.quantity, v_item.unit_cost, v_item.line_total);
        
        INSERT INTO inventory_movements (shop_id, product_id, movement_type, quantity, reference_id, idempotency_key)
        VALUES (p_shop_id, v_item.product_id, 'PURCHASE', v_item.quantity, v_purchase_id, gen_random_uuid());
    END LOOP;

    -- Update Idempotency Request
    UPDATE idempotent_requests 
    SET result_reference_id = v_purchase_id, processing_status = 'COMPLETED'
    WHERE idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object('status', 'success', 'purchase_id', v_purchase_id, 'replayed', false);
END;
$$;


-- 3. adjust_inventory
CREATE OR REPLACE FUNCTION public.adjust_inventory(
    p_idempotency_key UUID,
    p_request_hash VARCHAR,
    p_shop_id UUID,
    p_product_id UUID,
    p_quantity_change INT,
    p_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_shop_valid BOOLEAN;
    v_movement_id UUID;
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
            SELECT result_reference_id INTO v_movement_id FROM idempotent_requests WHERE idempotency_key = p_idempotency_key;
            RETURN jsonb_build_object('status', 'success', 'movement_id', v_movement_id, 'replayed', true);
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSE_MISMATCH';
        END IF;
    END IF;

    -- 3. Lock idempotency key
    INSERT INTO idempotent_requests (idempotency_key, shop_id, operation_type, request_hash, processing_status)
    VALUES (p_idempotency_key, p_shop_id, 'ADJUST_INVENTORY', p_request_hash, 'PENDING');

    -- 4. Insert Movement
    INSERT INTO inventory_movements (shop_id, product_id, movement_type, quantity, idempotency_key)
    VALUES (p_shop_id, p_product_id, 'ADJUSTMENT', p_quantity_change, p_idempotency_key)
    RETURNING id INTO v_movement_id;

    -- Update Idempotency Request
    UPDATE idempotent_requests 
    SET result_reference_id = v_movement_id, processing_status = 'COMPLETED'
    WHERE idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object('status', 'success', 'movement_id', v_movement_id, 'replayed', false);
END;
$$;


-- 4. create_manual_ledger_entry
CREATE OR REPLACE FUNCTION public.create_manual_ledger_entry(
    p_idempotency_key UUID,
    p_request_hash VARCHAR,
    p_shop_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC,
    p_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_shop_valid BOOLEAN;
    v_tx_id UUID;
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

    -- 2. Idempotency Check
    IF EXISTS (SELECT 1 FROM idempotent_requests WHERE idempotency_key = p_idempotency_key) THEN
        IF EXISTS (SELECT 1 FROM idempotent_requests WHERE idempotency_key = p_idempotency_key AND request_hash = p_request_hash) THEN
            SELECT result_reference_id INTO v_tx_id FROM idempotent_requests WHERE idempotency_key = p_idempotency_key;
            RETURN jsonb_build_object('status', 'success', 'transaction_id', v_tx_id, 'replayed', true);
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSE_MISMATCH';
        END IF;
    END IF;

    -- 3. Lock idempotency key
    INSERT INTO idempotent_requests (idempotency_key, shop_id, operation_type, request_hash, processing_status)
    VALUES (p_idempotency_key, p_shop_id, 'MANUAL_LEDGER', p_request_hash, 'PENDING');

    -- 4. Insert Ledger Transaction
    INSERT INTO ledger_transactions (shop_id, customer_id, transaction_type, amount, balance_impact, note, idempotency_key)
    VALUES (p_shop_id, p_customer_id, 'MANUAL_ADJUSTMENT', ABS(p_amount), p_amount, p_notes, p_idempotency_key)
    RETURNING id INTO v_tx_id;

    -- 5. Update balance cache safely (derived)
    UPDATE customers SET balance_cache = (
        SELECT COALESCE(SUM(balance_impact), 0) FROM ledger_transactions WHERE customer_id = p_customer_id
    ) WHERE id = p_customer_id;

    -- Update Idempotency Request
    UPDATE idempotent_requests 
    SET result_reference_id = v_tx_id, processing_status = 'COMPLETED'
    WHERE idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object('status', 'success', 'transaction_id', v_tx_id, 'replayed', false);
END;
$$;


-- 5. reverse_sale
CREATE OR REPLACE FUNCTION public.reverse_sale(
    p_idempotency_key UUID,
    p_request_hash VARCHAR,
    p_shop_id UUID,
    p_invoice_id UUID,
    p_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_shop_valid BOOLEAN;
    v_invoice RECORD;
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
            RETURN jsonb_build_object('status', 'success', 'invoice_id', p_invoice_id, 'replayed', true);
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSE_MISMATCH';
        END IF;
    END IF;

    -- 3. Lock idempotency key
    INSERT INTO idempotent_requests (idempotency_key, shop_id, operation_type, request_hash, processing_status)
    VALUES (p_idempotency_key, p_shop_id, 'REVERSE_SALE', p_request_hash, 'PENDING');

    -- 4. Get Invoice
    SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id AND shop_id = p_shop_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;
    
    IF v_invoice.payment_status = 'reversed' THEN
        RAISE EXCEPTION 'Invoice is already reversed';
    END IF;

    -- 5. Mark Invoice as reversed
    UPDATE invoices SET payment_status = 'reversed', notes = CONCAT(notes, '\n', p_notes)
    WHERE id = p_invoice_id;

    -- 6. Reverse Inventory
    FOR v_item IN SELECT * FROM invoice_items WHERE invoice_id = p_invoice_id
    LOOP
        INSERT INTO inventory_movements (shop_id, product_id, movement_type, quantity, reference_id, idempotency_key)
        VALUES (p_shop_id, v_item.product_id, 'RETURN', v_item.quantity, p_invoice_id, gen_random_uuid());
    END LOOP;

    -- 7. Reverse Ledger
    IF v_invoice.due > 0 THEN
        INSERT INTO ledger_transactions (shop_id, customer_id, transaction_type, amount, balance_impact, reference_id, idempotency_key, note)
        VALUES (p_shop_id, v_invoice.customer_id, 'MANUAL_ADJUSTMENT', v_invoice.due, -v_invoice.due, p_invoice_id, gen_random_uuid(), 'Reversal of sale ' || v_invoice.invoice_number);
    END IF;

    -- Update balance cache safely (derived)
    IF v_invoice.customer_id IS NOT NULL THEN
        UPDATE customers SET balance_cache = (
            SELECT COALESCE(SUM(balance_impact), 0) FROM ledger_transactions WHERE customer_id = v_invoice.customer_id
        ) WHERE id = v_invoice.customer_id;
    END IF;

    -- Update Idempotency Request
    UPDATE idempotent_requests 
    SET result_reference_id = p_invoice_id, processing_status = 'COMPLETED'
    WHERE idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object('status', 'success', 'invoice_id', p_invoice_id, 'replayed', false);
END;
$$;


-- 6. reverse_payment
CREATE OR REPLACE FUNCTION public.reverse_payment(
    p_idempotency_key UUID,
    p_request_hash VARCHAR,
    p_shop_id UUID,
    p_payment_id UUID,
    p_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_shop_valid BOOLEAN;
    v_payment RECORD;
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
            RETURN jsonb_build_object('status', 'success', 'payment_id', p_payment_id, 'replayed', true);
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSE_MISMATCH';
        END IF;
    END IF;

    -- 3. Lock idempotency key
    INSERT INTO idempotent_requests (idempotency_key, shop_id, operation_type, request_hash, processing_status)
    VALUES (p_idempotency_key, p_shop_id, 'REVERSE_PAYMENT', p_request_hash, 'PENDING');

    -- 4. Get Payment
    SELECT * INTO v_payment FROM payments WHERE id = p_payment_id AND shop_id = p_shop_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found';
    END IF;

    -- 5. Delete or Mark Payment? Append-Only -> we don't delete. We just add a reversing ledger transaction.
    -- Wait, payments table is append only. We can just add a reversing ledger transaction, and optionally a reversing payment record or just leave it.
    -- Let's add a reversing ledger entry.
    
    INSERT INTO ledger_transactions (shop_id, customer_id, transaction_type, amount, balance_impact, reference_id, idempotency_key, note)
    VALUES (p_shop_id, v_payment.customer_id, 'MANUAL_ADJUSTMENT', v_payment.amount, v_payment.amount, p_payment_id, gen_random_uuid(), 'Reversal of payment ' || p_payment_id || ' - ' || p_notes);

    -- 6. Update Invoice if it was linked
    IF v_payment.reference_id IS NOT NULL THEN
        -- Increase due, decrease paid
        UPDATE invoices 
        SET 
            paid = GREATEST(paid - v_payment.amount, 0),
            due = due + v_payment.amount,
            payment_status = CASE WHEN (due + v_payment.amount) > 0 THEN (CASE WHEN (paid - v_payment.amount) > 0 THEN 'partial' ELSE 'unpaid' END) ELSE 'paid' END
        WHERE id = v_payment.reference_id;
    END IF;

    -- Update balance cache safely (derived)
    UPDATE customers SET balance_cache = (
        SELECT COALESCE(SUM(balance_impact), 0) FROM ledger_transactions WHERE customer_id = v_payment.customer_id
    ) WHERE id = v_payment.customer_id;

    -- Update Idempotency Request
    UPDATE idempotent_requests 
    SET result_reference_id = p_payment_id, processing_status = 'COMPLETED'
    WHERE idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object('status', 'success', 'payment_id', p_payment_id, 'replayed', false);
END;
$$;
