ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS order_receive_mode TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS order_acceptance_mode TEXT NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurants_order_receive_mode_check') THEN
    ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_order_receive_mode_check
      CHECK (order_receive_mode IN ('system','system_whatsapp'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurants_order_acceptance_mode_check') THEN
    ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_order_acceptance_mode_check
      CHECK (order_acceptance_mode IN ('auto','manual'));
  END IF;
END $$;