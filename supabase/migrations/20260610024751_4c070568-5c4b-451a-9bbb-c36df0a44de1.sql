
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
