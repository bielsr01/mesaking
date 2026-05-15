-- Backfill order_status_history from quero_events for existing Quero orders.
-- For each (order, internal_status) we record the earliest quero_event timestamp.
WITH mapped AS (
  SELECT
    o.id AS order_id,
    CASE qe.status
      WHEN 'CREATED'   THEN 'pending'::order_status
      WHEN 'CONFIRMED' THEN 'preparing'::order_status
      WHEN 'DISPATCHED' THEN 'out_for_delivery'::order_status
      WHEN 'READY_FOR_PICKUP' THEN 'awaiting_pickup'::order_status
      WHEN 'PICKUP_AREA_ASSIGNED' THEN 'awaiting_pickup'::order_status
      WHEN 'CONCLUDED' THEN 'delivered'::order_status
      WHEN 'CANCELLED' THEN 'cancelled'::order_status
      ELSE NULL
    END AS internal_status,
    qe.created_at AS changed_at
  FROM public.quero_events qe
  JOIN public.orders o
    ON o.external_source = 'quero'
   AND o.external_order_id = qe.order_id
   AND o.restaurant_id = qe.restaurant_id
),
firsts AS (
  SELECT order_id, internal_status, MIN(changed_at) AS changed_at
  FROM mapped
  WHERE internal_status IS NOT NULL
  GROUP BY order_id, internal_status
)
INSERT INTO public.order_status_history (order_id, status, changed_at, source)
SELECT f.order_id, f.internal_status, f.changed_at, 'quero'
FROM firsts f
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_status_history h
  WHERE h.order_id = f.order_id
    AND h.status = f.internal_status
);