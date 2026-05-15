ALTER TABLE public.stock_groups
  ADD COLUMN IF NOT EXISTS allow_add boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_subtract boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_set boolean NOT NULL DEFAULT true;