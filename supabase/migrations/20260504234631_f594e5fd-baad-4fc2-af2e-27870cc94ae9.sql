
CREATE TABLE IF NOT EXISTS public.quero_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  api_url text NOT NULL DEFAULT 'https://api.quero.io',
  place_id text NOT NULL,
  auth_token text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quero_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager views quero integration"
  ON public.quero_integrations FOR SELECT
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Manager inserts quero integration"
  ON public.quero_integrations FOR INSERT
  WITH CHECK (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Manager updates quero integration"
  ON public.quero_integrations FOR UPDATE
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Manager deletes quero integration"
  ON public.quero_integrations FOR DELETE
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'));

CREATE TRIGGER quero_integrations_touch
  BEFORE UPDATE ON public.quero_integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_order_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_external
  ON public.orders(restaurant_id, external_source, external_order_id)
  WHERE external_source IS NOT NULL AND external_order_id IS NOT NULL;
