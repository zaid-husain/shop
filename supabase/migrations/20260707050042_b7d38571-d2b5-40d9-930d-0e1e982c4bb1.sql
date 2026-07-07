
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
