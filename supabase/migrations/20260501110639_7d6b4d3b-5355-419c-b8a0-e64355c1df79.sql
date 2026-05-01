ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS delivery_time_min integer,
  ADD COLUMN IF NOT EXISTS delivery_time_max integer;