
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS address_cep text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_neighborhood text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_zones jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_distance_km numeric,
  ADD COLUMN IF NOT EXISTS delivery_latitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_longitude double precision;
