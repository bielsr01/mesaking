
ALTER TABLE public.bulk_campaigns
  ADD COLUMN IF NOT EXISTS pause_after_messages integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pause_duration_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sent_in_block integer NOT NULL DEFAULT 0;
