
CREATE TABLE public.ihub_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  secret_token text NOT NULL,
  merchant_id text,
  merchant_name text,
  enabled boolean NOT NULL DEFAULT true,
  last_event_at timestamptz,
  last_event_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ihub_integrations_domain ON public.ihub_integrations(domain);
CREATE INDEX idx_ihub_integrations_merchant ON public.ihub_integrations(merchant_id);

ALTER TABLE public.ihub_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view their ihub integration"
  ON public.ihub_integrations FOR SELECT TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Managers can insert their ihub integration"
  ON public.ihub_integrations FOR INSERT TO authenticated
  WITH CHECK (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Managers can update their ihub integration"
  ON public.ihub_integrations FOR UPDATE TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Managers can delete their ihub integration"
  ON public.ihub_integrations FOR DELETE TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'));

CREATE TRIGGER ihub_integrations_touch
  BEFORE UPDATE ON public.ihub_integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ihub_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.ihub_integrations(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_id text,
  code text,
  full_code text,
  order_id text,
  merchant_id text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ihub_events_restaurant ON public.ihub_events(restaurant_id);
CREATE INDEX idx_ihub_events_order ON public.ihub_events(order_id);
CREATE INDEX idx_ihub_events_created ON public.ihub_events(created_at DESC);

ALTER TABLE public.ihub_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view their ihub events"
  ON public.ihub_events FOR SELECT TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'));
