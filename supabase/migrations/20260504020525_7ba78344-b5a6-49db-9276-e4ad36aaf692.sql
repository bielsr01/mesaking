ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_products_restaurant_sort ON public.products(restaurant_id, sort_order);

-- Initialize sort_order for existing products by created_at within each (restaurant, category)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY restaurant_id, category_id ORDER BY created_at) - 1 AS rn
  FROM public.products
)
UPDATE public.products p SET sort_order = r.rn FROM ranked r WHERE p.id = r.id AND p.sort_order = 0;