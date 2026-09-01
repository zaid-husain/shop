-- 1. Add receipt_url to ledger_transactions
ALTER TABLE ledger_transactions
ADD COLUMN receipt_url text;

-- 2. Create the Storage Bucket for Khata Receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('khata_receipts', 'khata_receipts', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Set up Row Level Security for Storage Objects
-- (Supabase manages RLS on storage.objects by default)

-- Allow users to upload receipts to their own shop_id folder
-- (We'll assume the path convention is: shop_id/filename.ext)
CREATE POLICY "Allow authenticated users to insert their own receipts" 
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'khata_receipts' AND 
  (storage.foldername(name))[1] = (SELECT shop_id::text FROM profiles WHERE id = auth.uid())
);

-- Allow users to select/read receipts from their own shop_id folder
CREATE POLICY "Allow authenticated users to view their own receipts" 
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'khata_receipts' AND 
  (storage.foldername(name))[1] = (SELECT shop_id::text FROM profiles WHERE id = auth.uid())
);

-- Allow public read access to all receipts since we made the bucket public
-- The frontend might need this to display images without signed URLs
CREATE POLICY "Allow public read access to khata_receipts" 
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'khata_receipts');

-- 4. Update the RPC to accept receipt_url
CREATE OR REPLACE FUNCTION public.create_manual_ledger_entry(
    p_idempotency_key UUID,
    p_request_hash VARCHAR,
    p_shop_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC,
    p_notes TEXT,
    p_receipt_url TEXT DEFAULT NULL
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
    INSERT INTO ledger_transactions (shop_id, customer_id, transaction_type, amount, balance_impact, note, idempotency_key, receipt_url)
    VALUES (p_shop_id, p_customer_id, 'MANUAL_ADJUSTMENT', ABS(p_amount), p_amount, p_notes, p_idempotency_key, p_receipt_url)
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
