
-- Tabela de integração Quero Delivery
CREATE TABLE public.quero_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE,
  token text NOT NULL,
  place_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_poll_at timestamptz,
  last_event_at timestamptz,
  last_event_code text,
  last_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quero_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager manages own quero integration"
  ON public.quero_integrations
  FOR ALL
  TO authenticated
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER quero_integrations_touch
BEFORE UPDATE ON public.quero_integrations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tabela de log de eventos do polling Quero
CREATE TABLE public.quero_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid,
  restaurant_id uuid,
  order_id text,
  order_code text,
  status text,
  processed boolean NOT NULL DEFAULT false,
  error text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quero_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view quero events"
  ON public.quero_events
  FOR SELECT
  TO authenticated
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE INDEX idx_quero_events_restaurant ON public.quero_events(restaurant_id, created_at DESC);
CREATE INDEX idx_quero_events_order ON public.quero_events(order_id);
