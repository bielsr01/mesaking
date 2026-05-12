
CREATE TABLE IF NOT EXISTS public.ifood_fee_settings (
  restaurant_id uuid PRIMARY KEY,
  commission_enabled boolean NOT NULL DEFAULT true,
  commission_pct numeric NOT NULL DEFAULT 0,
  card_enabled boolean NOT NULL DEFAULT true,
  card_pct numeric NOT NULL DEFAULT 0,
  anticipation_enabled boolean NOT NULL DEFAULT false,
  anticipation_pct numeric NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ifood_fee_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admin manages ifood fees"
ON public.ifood_fee_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Manager views own ifood fees"
ON public.ifood_fee_settings FOR SELECT TO authenticated
USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER trg_ifood_fee_settings_updated
BEFORE UPDATE ON public.ifood_fee_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ifood_subsidy numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_subsidy numeric NOT NULL DEFAULT 0;
