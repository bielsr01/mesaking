
-- Admin stock groups
CREATE TABLE public.admin_stock_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_stock_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Master admin manages admin stock groups" ON public.admin_stock_groups FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role));
CREATE TRIGGER trg_admin_stock_groups_touch BEFORE UPDATE ON public.admin_stock_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Admin stock subgroups
CREATE TABLE public.admin_stock_subgroups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.admin_stock_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  quantity int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_stock_subgroups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Master admin manages admin stock subgroups" ON public.admin_stock_subgroups FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role));
CREATE INDEX idx_admin_stock_subgroups_group ON public.admin_stock_subgroups(group_id);
CREATE TRIGGER trg_admin_stock_subgroups_touch BEFORE UPDATE ON public.admin_stock_subgroups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Movements
CREATE TYPE public.admin_stock_movement_type AS ENUM ('manual_set','manual_add','manual_subtract','supply_delivery');

CREATE TABLE public.admin_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subgroup_id uuid NOT NULL REFERENCES public.admin_stock_subgroups(id) ON DELETE CASCADE,
  quantity int NOT NULL,
  type admin_stock_movement_type NOT NULL,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Master admin reads admin stock movements" ON public.admin_stock_movements FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'master_admin'::app_role));
CREATE POLICY "Master admin inserts admin stock movements" ON public.admin_stock_movements FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role));
CREATE INDEX idx_admin_stock_movements_subgroup ON public.admin_stock_movements(subgroup_id);

-- Link supply products / options to admin stock
ALTER TABLE public.supply_products ADD COLUMN admin_stock_group_id uuid REFERENCES public.admin_stock_groups(id) ON DELETE SET NULL;
ALTER TABLE public.supply_product_options ADD COLUMN admin_stock_subgroup_id uuid REFERENCES public.admin_stock_subgroups(id) ON DELETE SET NULL;

-- Apply admin stock delta helper
CREATE OR REPLACE FUNCTION public.apply_admin_stock_delta(_subgroup_id uuid, _delta int, _type admin_stock_movement_type, _reference uuid, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.admin_stock_subgroups
    SET quantity = quantity + _delta, updated_at = now()
    WHERE id = _subgroup_id;
  INSERT INTO public.admin_stock_movements (subgroup_id, quantity, type, reference_id, notes)
    VALUES (_subgroup_id, _delta, _type, _reference, _notes);
END; $$;

-- Extend handle_supply_order_delivered to also debit admin stock
CREATE OR REPLACE FUNCTION public.handle_supply_order_delivered()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _item record;
  _opt record;
  _gid uuid;
  _qty int;
  _delivery_date date;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    _delivery_date := COALESCE(NEW.delivered_at, now())::date;

    FOR _item IN
      SELECT i.id AS item_id, i.product_id, i.product_name, i.quantity, i.unit_price,
             sp.stock_group_id, sp.total_quantity, sp.expense_category_id
      FROM public.supply_order_items i
      LEFT JOIN public.supply_products sp ON sp.id = i.product_id
      WHERE i.supply_order_id = NEW.id
    LOOP
      _gid := _item.stock_group_id;
      _qty := _item.quantity * COALESCE(_item.total_quantity, 1);
      IF _gid IS NOT NULL AND _qty > 0 THEN
        PERFORM public.apply_stock_delta(NEW.restaurant_id, _gid, _qty,
          'supply_delivery'::stock_movement_type, NEW.id, 'Pedido de insumo entregue');
      END IF;

      IF _item.expense_category_id IS NOT NULL AND _item.quantity > 0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.expenses
          WHERE restaurant_id = NEW.restaurant_id
            AND notes = 'supply_order_item:' || _item.item_id::text
        ) THEN
          INSERT INTO public.expenses (restaurant_id, description, category, category_id, amount, expense_date, notes, created_by)
          VALUES (
            NEW.restaurant_id,
            _item.product_name,
            (SELECT name FROM public.expense_categories WHERE id = _item.expense_category_id),
            _item.expense_category_id,
            (_item.unit_price * _item.quantity),
            _delivery_date,
            'supply_order_item:' || _item.item_id::text,
            NEW.created_by
          );
        END IF;
      END IF;

      -- Debit admin stock per option
      FOR _opt IN
        SELECT oo.option_name, oo.quantity, spo.admin_stock_subgroup_id
        FROM public.supply_order_item_options oo
        LEFT JOIN public.supply_product_options spo
          ON spo.product_id = _item.product_id AND spo.name = oo.option_name
        WHERE oo.supply_order_item_id = _item.item_id
      LOOP
        IF _opt.admin_stock_subgroup_id IS NOT NULL AND _opt.quantity > 0 THEN
          PERFORM public.apply_admin_stock_delta(
            _opt.admin_stock_subgroup_id, -_opt.quantity,
            'supply_delivery'::admin_stock_movement_type, NEW.id,
            'Pedido de insumo entregue'
          );
        END IF;
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;
