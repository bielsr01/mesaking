-- 1) Garantir extensões
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2) Índice para acelerar busca de pendentes vencidas
CREATE INDEX IF NOT EXISTS idx_evolution_message_queue_status_scheduled
  ON public.evolution_message_queue (status, scheduled_at);

-- 3) Atualizar trigger para disparar imediatamente via pg_net quando delay = 0
CREATE OR REPLACE FUNCTION public.enqueue_evolution_message_for_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _event text;
  _tpl record;
  _msg text;
  _digits text;
  _delay int;
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

  _delay := COALESCE(_tpl.delay_minutes, 0);

  INSERT INTO public.evolution_message_queue
    (restaurant_id, order_id, event_key, phone, message, scheduled_at)
  VALUES
    (NEW.restaurant_id, NEW.id, _event, NEW.customer_phone, _msg,
     now() + make_interval(mins => _delay));

  -- Disparo imediato se não houver atraso configurado
  IF _delay = 0 THEN
    PERFORM net.http_post(
      url := 'https://kcjrrnxsqdcgjqplgiku.supabase.co/functions/v1/evolution-dispatch',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjanJybnhzcWRjZ2pxcGxnaWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDI5NDEsImV4cCI6MjA5MzE3ODk0MX0.eZf9mkvQo-RgW403FGSHuKVk7gmCNCSX6deUJZG8yh0"}'::jsonb,
      body := '{}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Reagendar cron: 1x/min + 1x/min com pg_sleep(30) ≈ a cada 30s
DO $$
DECLARE
  _job_id bigint;
BEGIN
  FOR _job_id IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('evolution-dispatch-every-minute','evolution-dispatch-30s-a','evolution-dispatch-30s-b')
  LOOP
    PERFORM cron.unschedule(_job_id);
  END LOOP;
END $$;

SELECT cron.schedule(
  'evolution-dispatch-30s-a',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://kcjrrnxsqdcgjqplgiku.supabase.co/functions/v1/evolution-dispatch',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjanJybnhzcWRjZ2pxcGxnaWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDI5NDEsImV4cCI6MjA5MzE3ODk0MX0.eZf9mkvQo-RgW403FGSHuKVk7gmCNCSX6deUJZG8yh0"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'evolution-dispatch-30s-b',
  '* * * * *',
  $$
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url:='https://kcjrrnxsqdcgjqplgiku.supabase.co/functions/v1/evolution-dispatch',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjanJybnhzcWRjZ2pxcGxnaWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDI5NDEsImV4cCI6MjA5MzE3ODk0MX0.eZf9mkvQo-RgW403FGSHuKVk7gmCNCSX6deUJZG8yh0"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);