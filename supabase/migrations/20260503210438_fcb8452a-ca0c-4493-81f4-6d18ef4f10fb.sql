ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code text;
CREATE INDEX IF NOT EXISTS idx_orders_phone_coupon ON public.orders (restaurant_id, customer_phone, coupon_code);