-- Templates por restaurante e evento
CREATE TABLE public.evolution_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  event_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  template text NOT NULL DEFAULT '',
  delay_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, event_key)
);

ALTER TABLE public.evolution_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager manages own evolution templates"
ON public.evolution_message_templates FOR ALL
USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER touch_evolution_message_templates
BEFORE UPDATE ON public.evolution_message_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Fila de mensagens
CREATE TABLE public.evolution_message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  order_id uuid,
  event_key text NOT NULL,
  phone text NOT NULL,
  message text NOT NULL,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evolution_msg_queue_due_idx ON public.evolution_message_queue (status, scheduled_at);
CREATE INDEX evolution_msg_queue_rest_idx ON public.evolution_message_queue (restaurant_id);

ALTER TABLE public.evolution_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager views own evolution queue"
ON public.evolution_message_queue FOR SELECT
USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

-- Função: enfileira mensagem para um pedido, baseado no evento
CREATE OR REPLACE FUNCTION public.enqueue_evolution_message_for_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
  _tpl record;
  _msg text;
  _digits text;
BEGIN
  _digits := regexp_replace(COALESCE(NEW.customer_phone, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    _event := 'order_received';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    _event := CASE NEW.status::text
      WHEN 'accepted' THEN 'order_accepted'
      WHEN 'preparing' THEN 'order_in_production'
      WHEN 'out_for_delivery' THEN 'order_out_for_delivery'
      WHEN 'awaiting_pickup' THEN 'order_awaiting_pickup'
      WHEN 'delivered' THEN
        CASE
          WHEN NEW.external_source = 'quero' THEN 'order_delivered_quero'
          WHEN NEW.order_type::text = 'pickup' THEN 'order_delivered_pickup'
          WHEN NEW.order_type::text = 'pdv' THEN 'order_delivered_pdv'
          WHEN NEW.order_type::text = 'delivery' THEN 'order_delivered_delivery'
          ELSE NULL
        END
      ELSE NULL
    END;
  ELSE
    RETURN NEW;
  END IF;

  IF _event IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _tpl
    FROM public.evolution_message_templates
   WHERE restaurant_id = NEW.restaurant_id AND event_key = _event AND enabled = true
   LIMIT 1;
  IF _tpl IS NULL OR COALESCE(_tpl.template, '') = '' THEN
    RETURN NEW;
  END IF;

  _msg := _tpl.template;
  _msg := replace(_msg, '{{nome}}', COALESCE(NEW.customer_name, ''));
  _msg := replace(_msg, '{{pedido}}', COALESCE(NEW.order_number::text, ''));
  _msg := replace(_msg, '{{total}}', to_char(COALESCE(NEW.total, 0), 'FM999G990D00'));

  INSERT INTO public.evolution_message_queue
    (restaurant_id, order_id, event_key, phone, message, scheduled_at)
  VALUES
    (NEW.restaurant_id, NEW.id, _event, NEW.customer_phone, _msg,
     now() + make_interval(mins => COALESCE(_tpl.delay_minutes, 0)));

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_evolution_msg_insert
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_evolution_message_for_order();

CREATE TRIGGER trg_enqueue_evolution_msg_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_evolution_message_for_order();