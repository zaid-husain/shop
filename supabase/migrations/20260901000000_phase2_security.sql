-- Phase 2 Security: RBAC and Data Isolation

-- 1. Add 'manager' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

-- 2. Create helper to get current user role safely
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles 
  WHERE user_id = auth.uid() AND shop_id = public.current_shop_id() 
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;


-- =========================================================================
-- PRODUCTS
-- =========================================================================
DROP POLICY IF EXISTS "shop members access products" ON public.products;
CREATE POLICY "members read products" ON public.products 
  FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY "members insert products" ON public.products 
  FOR INSERT TO authenticated WITH CHECK (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager', 'staff'));
CREATE POLICY "managers update products" ON public.products 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "owners delete products" ON public.products 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');


-- =========================================================================
-- CUSTOMERS
-- =========================================================================
DROP POLICY IF EXISTS "shop members access customers" ON public.customers;
CREATE POLICY "members read customers" ON public.customers 
  FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY "members insert customers" ON public.customers 
  FOR INSERT TO authenticated WITH CHECK (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager', 'staff'));
CREATE POLICY "managers update customers" ON public.customers 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "owners delete customers" ON public.customers 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');


-- =========================================================================
-- INVOICES & INVOICE ITEMS
-- =========================================================================
DROP POLICY IF EXISTS "shop members access invoices" ON public.invoices;
CREATE POLICY "members read invoices" ON public.invoices 
  FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY "members insert invoices" ON public.invoices 
  FOR INSERT TO authenticated WITH CHECK (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager', 'staff'));
CREATE POLICY "managers update invoices" ON public.invoices 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "owners delete invoices" ON public.invoices 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');

DROP POLICY IF EXISTS "shop members access invoice items" ON public.invoice_items;
CREATE POLICY "members read invoice items" ON public.invoice_items 
  FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY "members insert invoice items" ON public.invoice_items 
  FOR INSERT TO authenticated WITH CHECK (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager', 'staff'));
CREATE POLICY "managers update invoice items" ON public.invoice_items 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "owners delete invoice items" ON public.invoice_items 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');


-- =========================================================================
-- LEDGER TRANSACTIONS & ENTRIES
-- =========================================================================
DROP POLICY IF EXISTS "shop members access ledger" ON public.ledger_transactions;
CREATE POLICY "members read ledger" ON public.ledger_transactions 
  FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY "members insert ledger" ON public.ledger_transactions 
  FOR INSERT TO authenticated WITH CHECK (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager', 'staff'));
CREATE POLICY "owners update ledger" ON public.ledger_transactions 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');
CREATE POLICY "owners delete ledger" ON public.ledger_transactions 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');

DROP POLICY IF EXISTS "shop members access ledger entries" ON public.ledger_entries;
CREATE POLICY "members read ledger entries" ON public.ledger_entries 
  FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY "members insert ledger entries" ON public.ledger_entries 
  FOR INSERT TO authenticated WITH CHECK (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager', 'staff'));
CREATE POLICY "owners update ledger entries" ON public.ledger_entries 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');
CREATE POLICY "owners delete ledger entries" ON public.ledger_entries 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');


-- =========================================================================
-- PAYMENTS
-- =========================================================================
DROP POLICY IF EXISTS "shop members access payments" ON public.payments;
CREATE POLICY "members read payments" ON public.payments 
  FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY "members insert payments" ON public.payments 
  FOR INSERT TO authenticated WITH CHECK (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager', 'staff'));
CREATE POLICY "owners update payments" ON public.payments 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');
CREATE POLICY "owners delete payments" ON public.payments 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');


-- =========================================================================
-- EXPENSES & PURCHASES (Restricted to Owner/Manager)
-- =========================================================================
DROP POLICY IF EXISTS "shop members access expenses" ON public.expenses;
CREATE POLICY "managers read expenses" ON public.expenses 
  FOR SELECT TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "managers insert expenses" ON public.expenses 
  FOR INSERT TO authenticated WITH CHECK (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "managers update expenses" ON public.expenses 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "owners delete expenses" ON public.expenses 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');

DROP POLICY IF EXISTS "shop members access purchases" ON public.purchases;
CREATE POLICY "managers read purchases" ON public.purchases 
  FOR SELECT TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "managers insert purchases" ON public.purchases 
  FOR INSERT TO authenticated WITH CHECK (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "managers update purchases" ON public.purchases 
  FOR UPDATE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() IN ('owner', 'manager'));
CREATE POLICY "owners delete purchases" ON public.purchases 
  FOR DELETE TO authenticated USING (shop_id = public.current_shop_id() AND public.current_user_role() = 'owner');
