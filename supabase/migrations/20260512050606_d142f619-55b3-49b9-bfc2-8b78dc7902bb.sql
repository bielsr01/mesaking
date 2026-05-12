ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS external_display_id text;
CREATE INDEX IF NOT EXISTS idx_orders_external ON public.orders (restaurant_id, external_source, external_order_id);