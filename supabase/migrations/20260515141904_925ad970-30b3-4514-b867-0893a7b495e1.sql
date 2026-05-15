ALTER TABLE public.evolution_integrations
  ADD COLUMN IF NOT EXISTS popup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS popup_text text,
  ADD COLUMN IF NOT EXISTS popup_whatsapp_message text;