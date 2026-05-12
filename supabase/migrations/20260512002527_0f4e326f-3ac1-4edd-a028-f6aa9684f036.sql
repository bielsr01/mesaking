
-- =========== STOCK GROUPS (global) ===========
CREATE TABLE public.stock_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stock groups read for authenticated"
  ON public.stock_groups FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Master admin manages stock groups"
  ON public.stock_groups FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER stock_groups_touch BEFORE UPDATE ON public.stock_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.stock_groups (name, sort_order) VALUES
  ('Coxinhas', 1), ('Churros', 2), ('Bebidas', 3);

-- =========== RESTAURANT STOCK ===========
CREATE TABLE public.restaurant_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.stock_groups(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, group_id)
);
CREATE INDEX idx_restaurant_stock_rest ON public.restaurant_stock(restaurant_id);
ALTER TABLE public.restaurant_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager views own stock"
  ON public.restaurant_stock FOR SELECT TO authenticated
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(),'master_admin'::app_role));

CREATE POLICY "Manager manages own stock"
  ON public.restaurant_stock FOR ALL TO authenticated
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(),'master_admin'::app_role))
  WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(),'master_admin'::app_role));

CREATE TRIGGER restaurant_stock_touch BEFORE UPDATE ON public.restaurant_stock
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========== STOCK MOVEMENTS ===========
CREATE TYPE public.stock_movement_type AS ENUM ('supply_delivery','order_consumption','order_revert','manual_adjust');

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.stock_groups(id) ON DELETE RESTRICT,
  quantity integer NOT NULL, -- pode ser negativo
  type public.stock_movement_type NOT NULL,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_rest ON public.stock_movements(restaurant_id, created_at DESC);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager views own movements"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(),'master_admin'::app_role));

CREATE POLICY "Manager inserts movements"
  ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(),'master_admin'::app_role));

-- =========== PRODUCT STOCK CONSUMPTION ===========
CREATE TABLE public.product_stock_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.stock_groups(id) ON DELETE RESTRICT,
  quantity_per_unit numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, group_id)
);
CREATE INDEX idx_psc_product ON public.product_stock_consumption(product_id);
ALTER TABLE public.product_stock_consumption ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PSC public read"
  ON public.product_stock_consumption FOR SELECT
  USING (true);

CREATE POLICY "Manager manages PSC"
  ON public.product_stock_consumption FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_stock_consumption.product_id
    AND (is_restaurant_manager(auth.uid(), p.restaurant_id) OR has_role(auth.uid(),'master_admin'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM products p WHERE p.id = product_stock_consumption.product_id
    AND (is_restaurant_manager(auth.uid(), p.restaurant_id) OR has_role(auth.uid(),'master_admin'::app_role))));

-- =========== SUPPLY PRODUCTS LINK ===========
ALTER TABLE public.supply_products ADD COLUMN stock_group_id uuid REFERENCES public.stock_groups(id) ON DELETE SET NULL;

-- =========== HELPER FUNCTIONS ===========
CREATE OR REPLACE FUNCTION public.apply_stock_delta(
  _restaurant_id uuid, _group_id uuid, _delta integer,
  _type public.stock_movement_type, _reference uuid, _notes text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.restaurant_stock (restaurant_id, group_id, quantity)
  VALUES (_restaurant_id, _group_id, _delta)
  ON CONFLICT (restaurant_id, group_id)
  DO UPDATE SET quantity = public.restaurant_stock.quantity + _delta, updated_at = now();

  INSERT INTO public.stock_movements (restaurant_id, group_id, quantity, type, reference_id, notes)
  VALUES (_restaurant_id, _group_id, _delta, _type, _reference, _notes);
END;
$$;

-- =========== TRIGGER: SUPPLY DELIVERY ===========
CREATE OR REPLACE FUNCTION public.handle_supply_order_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _item record;
  _gid uuid;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    FOR _item IN
      SELECT i.product_id, i.quantity, sp.stock_group_id
      FROM public.supply_order_items i
      LEFT JOIN public.supply_products sp ON sp.id = i.product_id
      WHERE i.supply_order_id = NEW.id
    LOOP
      _gid := _item.stock_group_id;
      IF _gid IS NOT NULL AND _item.quantity > 0 THEN
        PERFORM public.apply_stock_delta(NEW.restaurant_id, _gid, _item.quantity,
          'supply_delivery'::stock_movement_type, NEW.id, 'Pedido de insumo entregue');
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER supply_orders_delivered_trg
  AFTER UPDATE ON public.supply_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_supply_order_delivered();

-- =========== TRIGGER: ORDER ACCEPTED / REVERT ===========
CREATE OR REPLACE FUNCTION public.handle_order_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row record;
  _was_consumed boolean;
  _is_consumed boolean;
BEGIN
  _was_consumed := OLD.status IN ('accepted','preparing','ready','out_for_delivery','delivered');
  _is_consumed  := NEW.status IN ('accepted','preparing','ready','out_for_delivery','delivered');

  IF (NOT _was_consumed) AND _is_consumed THEN
    -- DEBITAR
    FOR _row IN
      SELECT psc.group_id, SUM(oi.quantity * psc.quantity_per_unit)::int AS qty
      FROM public.order_items oi
      JOIN public.product_stock_consumption psc ON psc.product_id = oi.product_id
      WHERE oi.order_id = NEW.id
      GROUP BY psc.group_id
    LOOP
      IF _row.qty > 0 THEN
        PERFORM public.apply_stock_delta(NEW.restaurant_id, _row.group_id, -_row.qty,
          'order_consumption'::stock_movement_type, NEW.id, 'Pedido aceito');
      END IF;
    END LOOP;
  ELSIF _was_consumed AND (NOT _is_consumed) THEN
    -- REVERTER
    FOR _row IN
      SELECT psc.group_id, SUM(oi.quantity * psc.quantity_per_unit)::int AS qty
      FROM public.order_items oi
      JOIN public.product_stock_consumption psc ON psc.product_id = oi.product_id
      WHERE oi.order_id = NEW.id
      GROUP BY psc.group_id
    LOOP
      IF _row.qty > 0 THEN
        PERFORM public.apply_stock_delta(NEW.restaurant_id, _row.group_id, _row.qty,
          'order_revert'::stock_movement_type, NEW.id, 'Pedido cancelado/revertido');
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_stock_trg
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_stock();
