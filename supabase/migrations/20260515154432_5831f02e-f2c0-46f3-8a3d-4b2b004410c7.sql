
ALTER TABLE public.evolution_integrations
  ADD COLUMN IF NOT EXISTS instance_token text,
  ADD COLUMN IF NOT EXISTS qrcode text,
  ADD COLUMN IF NOT EXISTS phone_number text;

ALTER TABLE public.evolution_integrations
  ALTER COLUMN api_url DROP NOT NULL,
  ALTER COLUMN api_key DROP NOT NULL,
  ALTER COLUMN instance_name DROP NOT NULL;
