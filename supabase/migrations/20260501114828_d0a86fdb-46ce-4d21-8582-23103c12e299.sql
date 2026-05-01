ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS whatsapp_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS service_delivery boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS service_pickup boolean NOT NULL DEFAULT false;