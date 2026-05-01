-- Grupos de opções (submenus) para produtos do cardápio
CREATE TABLE public.option_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL,
  name TEXT NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.option_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.option_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  extra_price NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.product_option_groups (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.option_groups(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);

CREATE INDEX idx_option_groups_restaurant ON public.option_groups(restaurant_id);
CREATE INDEX idx_option_items_group ON public.option_items(group_id);
CREATE INDEX idx_pog_group ON public.product_option_groups(group_id);

ALTER TABLE public.option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;

-- option_groups: público lê ativos; manager/master gerencia
CREATE POLICY "Option groups public read active" ON public.option_groups
  FOR SELECT USING (is_active = true OR is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Manager manages option groups" ON public.option_groups
  FOR ALL USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'))
  WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'));

-- option_items: público lê ativos cujo grupo é ativo; manager gerencia se for dono do restaurante do grupo
CREATE POLICY "Option items public read" ON public.option_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.option_groups g WHERE g.id = option_items.group_id
      AND (g.is_active = true OR is_restaurant_manager(auth.uid(), g.restaurant_id) OR has_role(auth.uid(), 'master_admin')))
  );

CREATE POLICY "Manager manages option items" ON public.option_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.option_groups g WHERE g.id = option_items.group_id
      AND (is_restaurant_manager(auth.uid(), g.restaurant_id) OR has_role(auth.uid(), 'master_admin')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.option_groups g WHERE g.id = option_items.group_id
      AND (is_restaurant_manager(auth.uid(), g.restaurant_id) OR has_role(auth.uid(), 'master_admin')))
  );

-- product_option_groups
CREATE POLICY "POG public read" ON public.product_option_groups
  FOR SELECT USING (true);

CREATE POLICY "Manager manages POG" ON public.product_option_groups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_option_groups.product_id
      AND (is_restaurant_manager(auth.uid(), p.restaurant_id) OR has_role(auth.uid(), 'master_admin')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_option_groups.product_id
      AND (is_restaurant_manager(auth.uid(), p.restaurant_id) OR has_role(auth.uid(), 'master_admin')))
  );

CREATE TRIGGER touch_option_groups BEFORE UPDATE ON public.option_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();