ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS manual_override jsonb;