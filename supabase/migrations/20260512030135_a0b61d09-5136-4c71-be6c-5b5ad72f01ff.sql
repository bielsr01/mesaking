ALTER TABLE public.supply_products
  ADD COLUMN IF NOT EXISTS expense_category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.handle_supply_order_delivered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item record;
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
      -- Stock movement
      _gid := _item.stock_group_id;
      _qty := _item.quantity * COALESCE(_item.total_quantity, 1);
      IF _gid IS NOT NULL AND _qty > 0 THEN
        PERFORM public.apply_stock_delta(NEW.restaurant_id, _gid, _qty,
          'supply_delivery'::stock_movement_type, NEW.id, 'Pedido de insumo entregue');
      END IF;

      -- Auto expense per item only when product has linked expense category
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
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;