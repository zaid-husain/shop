
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('owner', 'staff');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  pin_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  shop_id UUID NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

CREATE OR REPLACE FUNCTION public.current_shop_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT shop_id FROM public.profiles WHERE id = auth.uid() LIMIT 1 $$;

-- Profile policies
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "owner reads shop profiles" ON public.profiles FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  name TEXT NOT NULL,
  part_number TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  brand TEXT,
  variant TEXT,
  purchase_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  image_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop members access products" ON public.products FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id()) WITH CHECK (shop_id = public.current_shop_id());
CREATE INDEX products_shop_idx ON public.products(shop_id);
CREATE INDEX products_search_idx ON public.products(shop_id, name);
CREATE INDEX products_part_idx ON public.products(shop_id, part_number);

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT,
  vehicle_number TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop members access customers" ON public.customers FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id()) WITH CHECK (shop_id = public.current_shop_id());
CREATE INDEX customers_shop_idx ON public.customers(shop_id);

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  invoice_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_mobile TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  due NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'paid', -- paid, partial, due
  payment_method TEXT,
  notes TEXT,
  cost_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, invoice_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop members access invoices" ON public.invoices FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id()) WITH CHECK (shop_id = public.current_shop_id());
CREATE INDEX invoices_shop_date_idx ON public.invoices(shop_id, created_at DESC);

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  part_number TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop members access invoice items" ON public.invoice_items FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id()) WITH CHECK (shop_id = public.current_shop_id());
CREATE INDEX invoice_items_invoice_idx ON public.invoice_items(invoice_id);

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads audit" ON public.audit_log FOR SELECT TO authenticated
  USING (shop_id = public.current_shop_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "members insert audit" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (shop_id = public.current_shop_id());

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile + owner role on signup (uses raw_user_meta_data)
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop_id UUID := gen_random_uuid();
  v_name TEXT := COALESCE(NEW.raw_user_meta_data->>'full_name', 'Shop Owner');
  v_phone TEXT := COALESCE(NEW.raw_user_meta_data->>'phone', '');
BEGIN
  INSERT INTO public.profiles (id, shop_id, full_name, phone)
  VALUES (NEW.id, v_shop_id, v_name, v_phone);
  INSERT INTO public.user_roles (user_id, role, shop_id)
  VALUES (NEW.id, 'owner', v_shop_id);
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Decrement stock when invoice item inserted
CREATE OR REPLACE FUNCTION public.decrement_stock() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock_quantity = GREATEST(stock_quantity - NEW.quantity, 0)
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_item_decrement_stock
  AFTER INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.decrement_stock();

-- Lock search_path on remaining functions
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

-- Trigger-only functions: revoke from everyone
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrement_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- Helper functions used inside RLS: restrict to authenticated only
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_shop_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_shop_id() TO authenticated;

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

CREATE TYPE public.ledger_entry_type AS ENUM ('credit', 'payment');

CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  entry_type public.ledger_entry_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  payment_method TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_customer_date ON public.ledger_entries(customer_id, entry_date DESC);
CREATE INDEX idx_ledger_shop_date ON public.ledger_entries(shop_id, entry_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop members read ledger"
  ON public.ledger_entries FOR SELECT
  TO authenticated
  USING (shop_id = public.current_shop_id());

CREATE POLICY "shop members insert ledger"
  ON public.ledger_entries FOR INSERT
  TO authenticated
  WITH CHECK (shop_id = public.current_shop_id() AND created_by = auth.uid());

CREATE POLICY "shop members update ledger"
  ON public.ledger_entries FOR UPDATE
  TO authenticated
  USING (shop_id = public.current_shop_id())
  WITH CHECK (shop_id = public.current_shop_id());

CREATE POLICY "shop members delete ledger"
  ON public.ledger_entries FOR DELETE
  TO authenticated
  USING (shop_id = public.current_shop_id());

CREATE TRIGGER trg_ledger_updated_at
  BEFORE UPDATE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.decrement_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products
       SET stock_quantity = GREATEST(stock_quantity - NEW.quantity, 0)
     WHERE id = NEW.product_id
       AND shop_id = NEW.shop_id;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.user_id = _user_id
       AND ur.role = _role
       AND ur.shop_id = p.shop_id
  )
$function$;

-- suppliers
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop members manage suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id())
  WITH CHECK (shop_id = public.current_shop_id());
CREATE TRIGGER suppliers_touch BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX suppliers_shop_idx ON public.suppliers(shop_id);

-- purchases
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  bill_number TEXT,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  due NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop members manage purchases" ON public.purchases
  FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id())
  WITH CHECK (shop_id = public.current_shop_id());
CREATE TRIGGER purchases_touch BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX purchases_shop_date_idx ON public.purchases(shop_id, bill_date DESC);

-- purchase_items
CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop members manage purchase items" ON public.purchase_items
  FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id())
  WITH CHECK (shop_id = public.current_shop_id());
CREATE INDEX purchase_items_purchase_idx ON public.purchase_items(purchase_id);
CREATE INDEX purchase_items_shop_idx ON public.purchase_items(shop_id);

-- Trigger: increment stock & update last cost on purchase item insert
CREATE OR REPLACE FUNCTION public.increment_stock_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products
       SET stock_quantity = stock_quantity + NEW.quantity,
           purchase_price = CASE WHEN NEW.unit_cost > 0 THEN NEW.unit_cost ELSE purchase_price END
     WHERE id = NEW.product_id
       AND shop_id = NEW.shop_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER purchase_items_increment_stock
  AFTER INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.increment_stock_on_purchase();

REVOKE EXECUTE ON FUNCTION public.increment_stock_on_purchase() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_shop_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- 1) Restrict profiles.pin_hash so authenticated users cannot SELECT it
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, shop_id, full_name, phone, created_at, updated_at) ON public.profiles TO authenticated;

-- 2) Switch SECURITY DEFINER helpers used only for RLS lookups to SECURITY INVOKER
--    so signed-in users cannot execute privileged code paths. RLS on profiles /
--    user_roles already scopes lookups to the caller's own rows.
CREATE OR REPLACE FUNCTION public.current_shop_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO 'public'
AS $function$ SELECT shop_id FROM public.profiles WHERE id = auth.uid() LIMIT 1 $function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.user_id = _user_id
       AND ur.role = _role
       AND ur.shop_id = p.shop_id
  )
$function$;

-- 3) Stop the purchase trigger from overwriting the canonical product purchase_price.
--    Stock still increments; owners can update the price explicitly if needed.
CREATE OR REPLACE FUNCTION public.increment_stock_on_purchase()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products
       SET stock_quantity = stock_quantity + NEW.quantity
     WHERE id = NEW.product_id
       AND shop_id = NEW.shop_id;
  END IF;
  RETURN NEW;
END $function$;

-- 4) Enforce invoice financial integrity server-side.
--    a) Snap invoice_items.unit_cost to the current products.purchase_price
--       so clients cannot forge cost figures.
CREATE OR REPLACE FUNCTION public.enforce_invoice_item_cost()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_cost numeric;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT purchase_price INTO v_cost
      FROM public.products
     WHERE id = NEW.product_id
       AND shop_id = NEW.shop_id;
    NEW.unit_cost := COALESCE(v_cost, 0);
  ELSE
    NEW.unit_cost := GREATEST(COALESCE(NEW.unit_cost, 0), 0);
  END IF;
  NEW.line_total := ROUND(NEW.unit_price * NEW.quantity, 2);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_item_cost ON public.invoice_items;
CREATE TRIGGER trg_enforce_invoice_item_cost
  BEFORE INSERT OR UPDATE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_item_cost();

--    b) Recompute invoices.cost_total and profit from invoice_items after any item change.
CREATE OR REPLACE FUNCTION public.recompute_invoice_totals()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_cost numeric;
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(unit_cost * quantity), 0)
    INTO v_cost
    FROM public.invoice_items
   WHERE invoice_id = v_invoice_id;

  SELECT total INTO v_total FROM public.invoices WHERE id = v_invoice_id;

  UPDATE public.invoices
     SET cost_total = v_cost,
         profit = COALESCE(v_total, 0) - v_cost
   WHERE id = v_invoice_id;

  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_recompute_invoice_totals ON public.invoice_items;
CREATE TRIGGER trg_recompute_invoice_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.recompute_invoice_totals();

--    c) On the invoices row itself, enforce due = total - paid and keep profit consistent
--       with the current cost_total, ignoring client-supplied profit/due values.
CREATE OR REPLACE FUNCTION public.enforce_invoice_consistency()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  NEW.due := ROUND(COALESCE(NEW.total, 0) - COALESCE(NEW.paid, 0), 2);
  NEW.profit := ROUND(COALESCE(NEW.total, 0) - COALESCE(NEW.cost_total, 0), 2);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_consistency ON public.invoices;
CREATE TRIGGER trg_enforce_invoice_consistency
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_consistency();

REVOKE EXECUTE ON FUNCTION public.enforce_invoice_item_cost() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_invoice_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_invoice_consistency() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_stock_on_purchase() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
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
