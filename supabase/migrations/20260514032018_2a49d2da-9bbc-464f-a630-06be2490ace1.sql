-- Track each status change with its timestamp
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  status order_status NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  source text
);

CREATE INDEX IF NOT EXISTS idx_osh_order ON public.order_status_history(order_id, changed_at);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view order status history"
  ON public.order_status_history FOR SELECT USING (true);

CREATE POLICY "System can insert order status history"
  ON public.order_status_history FOR INSERT WITH CHECK (true);

-- Trigger: insert row on order create + on status change
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history(order_id, status, changed_at, source)
    VALUES (NEW.id, NEW.status, NEW.created_at, COALESCE(NEW.external_source, 'system'));
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history(order_id, status, changed_at, source)
    VALUES (NEW.id, NEW.status, now(), COALESCE(NEW.external_source, 'system'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_status_change ON public.orders;
CREATE TRIGGER trg_log_order_status_change
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

-- Backfill: existing orders -> initial pending row using created_at, current status using updated_at
INSERT INTO public.order_status_history(order_id, status, changed_at, source)
SELECT o.id, 'pending'::order_status, o.created_at, COALESCE(o.external_source,'system')
FROM public.orders o
WHERE NOT EXISTS (SELECT 1 FROM public.order_status_history h WHERE h.order_id = o.id);

INSERT INTO public.order_status_history(order_id, status, changed_at, source)
SELECT o.id, o.status, COALESCE(o.updated_at, o.created_at), COALESCE(o.external_source,'system')
FROM public.orders o
WHERE o.status <> 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.order_status_history h
    WHERE h.order_id = o.id AND h.status = o.status
  );

-- Backfill from ihub_events for iFood orders: map fullCode -> internal status
INSERT INTO public.order_status_history(order_id, status, changed_at, source)
SELECT o.id,
  (CASE e.full_code
    WHEN 'PLACED' THEN 'pending'
    WHEN 'CONFIRMED' THEN 'preparing'
    WHEN 'PREPARATION_STARTED' THEN 'preparing'
    WHEN 'READY_TO_PICKUP' THEN 'awaiting_pickup'
    WHEN 'DISPATCHED' THEN 'out_for_delivery'
    WHEN 'CONCLUDED' THEN 'delivered'
    WHEN 'CANCELLED' THEN 'cancelled'
   END)::order_status,
  e.created_at,
  'ifood'
FROM public.ihub_events e
JOIN public.orders o
  ON o.external_source = 'ifood'
 AND o.external_order_id = e.order_id
WHERE e.full_code IN ('PLACED','CONFIRMED','PREPARATION_STARTED','READY_TO_PICKUP','DISPATCHED','CONCLUDED','CANCELLED')
  AND NOT EXISTS (
    SELECT 1 FROM public.order_status_history h
    WHERE h.order_id = o.id
      AND h.status = (CASE e.full_code
        WHEN 'PLACED' THEN 'pending'
        WHEN 'CONFIRMED' THEN 'preparing'
        WHEN 'PREPARATION_STARTED' THEN 'preparing'
        WHEN 'READY_TO_PICKUP' THEN 'awaiting_pickup'
        WHEN 'DISPATCHED' THEN 'out_for_delivery'
        WHEN 'CONCLUDED' THEN 'delivered'
        WHEN 'CANCELLED' THEN 'cancelled'
      END)::order_status
      AND h.changed_at = e.created_at
  );