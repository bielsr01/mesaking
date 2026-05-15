ALTER TABLE public.ifood_fee_settings 
  ADD COLUMN IF NOT EXISTS widget_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS widget_merchant_id text;