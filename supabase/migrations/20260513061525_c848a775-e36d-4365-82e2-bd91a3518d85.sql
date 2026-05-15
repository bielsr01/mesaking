ALTER TABLE public.option_items
  ADD COLUMN IF NOT EXISTS stock_group_id uuid NULL REFERENCES public.stock_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_quantity_per_unit numeric NOT NULL DEFAULT 1;