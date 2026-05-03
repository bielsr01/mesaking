
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  apply_to TEXT NOT NULL DEFAULT 'order' CHECK (apply_to IN ('order','items')),
  product_ids UUID[] NOT NULL DEFAULT '{}',
  discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','value')),
  discount_value NUMERIC NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  usage_limit_total INTEGER,
  usage_limit_per_customer INTEGER NOT NULL DEFAULT 0,
  min_order_value NUMERIC NOT NULL DEFAULT 0,
  customer_type TEXT NOT NULL DEFAULT 'all' CHECK (customer_type IN ('all','new')),
  service_delivery BOOLEAN NOT NULL DEFAULT true,
  service_pickup BOOLEAN NOT NULL DEFAULT true,
  show_on_menu BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  uses_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code)
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coupons public read active"
ON public.coupons FOR SELECT
USING (is_active = true OR is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Manager manages coupons"
ON public.coupons FOR ALL
USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER trg_coupons_updated_at
BEFORE UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_coupons_restaurant ON public.coupons(restaurant_id);
