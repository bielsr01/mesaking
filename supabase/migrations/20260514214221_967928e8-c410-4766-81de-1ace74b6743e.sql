CREATE TABLE IF NOT EXISTS public.quero_fee_settings (
  restaurant_id uuid PRIMARY KEY,
  commission_enabled boolean NOT NULL DEFAULT true,
  commission_pct numeric NOT NULL DEFAULT 8,
  online_payment_enabled boolean NOT NULL DEFAULT true,
  online_payment_pct numeric NOT NULL DEFAULT 4.99,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quero_fee_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager views own quero fees"
ON public.quero_fee_settings FOR SELECT TO authenticated
USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Master admin manages quero fees"
ON public.quero_fee_settings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER quero_fee_settings_touch_updated
BEFORE UPDATE ON public.quero_fee_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();