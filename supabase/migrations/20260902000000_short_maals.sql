-- ============ SHORT MAALS ============
CREATE TABLE public.short_maals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_needed INTEGER NOT NULL DEFAULT 1 CHECK (quantity_needed > 0),
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.short_maals TO authenticated;
GRANT ALL ON public.short_maals TO service_role;
ALTER TABLE public.short_maals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop members access short maals" ON public.short_maals FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id()) WITH CHECK (shop_id = public.current_shop_id());

CREATE INDEX short_maals_shop_idx ON public.short_maals(shop_id);
CREATE INDEX short_maals_shop_status_idx ON public.short_maals(shop_id, status);

CREATE TRIGGER short_maals_touch BEFORE UPDATE ON public.short_maals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
