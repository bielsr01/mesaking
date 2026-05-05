
-- Enum de status
CREATE TYPE public.supply_order_status AS ENUM ('pending','accepted','shipped','delivered');

-- Catálogo de insumos (gerenciado pelo master admin)
CREATE TABLE public.supply_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'un',
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.supply_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supply products read for authenticated"
ON public.supply_products FOR SELECT TO authenticated
USING (is_active = true OR has_role(auth.uid(),'master_admin'));

CREATE POLICY "Master admin manages supply products"
ON public.supply_products FOR ALL TO authenticated
USING (has_role(auth.uid(),'master_admin'))
WITH CHECK (has_role(auth.uid(),'master_admin'));

CREATE TRIGGER trg_supply_products_updated
BEFORE UPDATE ON public.supply_products
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Pedidos de insumos
CREATE TABLE public.supply_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  created_by UUID,
  status public.supply_order_status NOT NULL DEFAULT 'pending',
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);
CREATE INDEX idx_supply_orders_restaurant ON public.supply_orders(restaurant_id);
CREATE INDEX idx_supply_orders_status ON public.supply_orders(status);
ALTER TABLE public.supply_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager views own supply orders"
ON public.supply_orders FOR SELECT TO authenticated
USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(),'master_admin'));

CREATE POLICY "Manager creates supply orders"
ON public.supply_orders FOR INSERT TO authenticated
WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(),'master_admin'));

CREATE POLICY "Master admin updates supply orders"
ON public.supply_orders FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'master_admin'))
WITH CHECK (has_role(auth.uid(),'master_admin'));

CREATE POLICY "Master admin deletes supply orders"
ON public.supply_orders FOR DELETE TO authenticated
USING (has_role(auth.uid(),'master_admin'));

CREATE TRIGGER trg_supply_orders_updated
BEFORE UPDATE ON public.supply_orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Itens de pedido
CREATE TABLE public.supply_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_order_id UUID NOT NULL REFERENCES public.supply_orders(id) ON DELETE CASCADE,
  product_id UUID,
  product_name TEXT NOT NULL,
  unit TEXT,
  unit_price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_supply_order_items_order ON public.supply_order_items(supply_order_id);
ALTER TABLE public.supply_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supply order items view"
ON public.supply_order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.supply_orders o WHERE o.id = supply_order_id
   AND (is_restaurant_manager(auth.uid(), o.restaurant_id) OR has_role(auth.uid(),'master_admin'))));

CREATE POLICY "Supply order items insert"
ON public.supply_order_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.supply_orders o WHERE o.id = supply_order_id
   AND (is_restaurant_manager(auth.uid(), o.restaurant_id) OR has_role(auth.uid(),'master_admin'))));

CREATE POLICY "Supply order items delete by master"
ON public.supply_order_items FOR DELETE TO authenticated
USING (has_role(auth.uid(),'master_admin'));
