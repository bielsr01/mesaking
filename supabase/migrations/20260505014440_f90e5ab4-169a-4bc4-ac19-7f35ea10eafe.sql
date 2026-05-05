-- Add limiter fields to supply_products
ALTER TABLE public.supply_products
  ADD COLUMN IF NOT EXISTS variant_group_name text,
  ADD COLUMN IF NOT EXISTS total_quantity integer,
  ADD COLUMN IF NOT EXISTS quantity_step integer NOT NULL DEFAULT 50;

-- Options (sabores) per supply product
CREATE TABLE IF NOT EXISTS public.supply_product_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.supply_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supply_product_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supply options read for authenticated"
  ON public.supply_product_options FOR SELECT TO authenticated
  USING (is_active = true OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Master admin manages supply options"
  ON public.supply_product_options FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role));

-- Per-flavor breakdown for each ordered item
CREATE TABLE IF NOT EXISTS public.supply_order_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_order_item_id uuid NOT NULL REFERENCES public.supply_order_items(id) ON DELETE CASCADE,
  option_name text NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supply_order_item_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supply order item options view"
  ON public.supply_order_item_options FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.supply_order_items i
    JOIN public.supply_orders o ON o.id = i.supply_order_id
    WHERE i.id = supply_order_item_options.supply_order_item_id
      AND (is_restaurant_manager(auth.uid(), o.restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
  ));

CREATE POLICY "Supply order item options insert"
  ON public.supply_order_item_options FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.supply_order_items i
    JOIN public.supply_orders o ON o.id = i.supply_order_id
    WHERE i.id = supply_order_item_options.supply_order_item_id
      AND (is_restaurant_manager(auth.uid(), o.restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
  ));

CREATE POLICY "Supply order item options delete master"
  ON public.supply_order_item_options FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'master_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_supply_options_product ON public.supply_product_options(product_id);
CREATE INDEX IF NOT EXISTS idx_supply_order_item_options_item ON public.supply_order_item_options(supply_order_item_id);