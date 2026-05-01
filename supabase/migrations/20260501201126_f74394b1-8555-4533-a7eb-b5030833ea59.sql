ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS delivery_fee_mode text NOT NULL DEFAULT 'radius',
  ADD COLUMN IF NOT EXISTS delivery_fixed_fee numeric NOT NULL DEFAULT 0;

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_delivery_fee_mode_check;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_delivery_fee_mode_check
  CHECK (delivery_fee_mode IN ('fixed','radius'));