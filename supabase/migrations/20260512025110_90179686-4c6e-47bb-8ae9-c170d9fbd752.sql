
-- Ensure "Compras de insumos" category exists for restaurant scope
INSERT INTO public.expense_categories (name, scope, requires_description, is_active, sort_order)
SELECT 'Compras de insumos', 'restaurant', false, true, 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories WHERE scope = 'restaurant' AND lower(name) = lower('Compras de insumos')
);

-- Extend supply order delivered handler to register an expense automatically
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
  _cat_id uuid;
  _delivery_date date;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    -- Stock movements
    FOR _item IN
      SELECT i.product_id, i.quantity, sp.stock_group_id, sp.total_quantity
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
    END LOOP;

    -- Auto-register expense for the delivery
    IF COALESCE(NEW.total, 0) > 0 THEN
      _delivery_date := COALESCE(NEW.delivered_at, now())::date;
      SELECT id INTO _cat_id FROM public.expense_categories
        WHERE scope = 'restaurant' AND lower(name) = lower('Compras de insumos')
        LIMIT 1;

      -- Avoid duplicates if trigger fires twice for same supply order
      IF NOT EXISTS (
        SELECT 1 FROM public.expenses
        WHERE restaurant_id = NEW.restaurant_id
          AND notes = 'supply_order:' || NEW.id::text
      ) THEN
        INSERT INTO public.expenses (restaurant_id, description, category, category_id, amount, expense_date, notes, created_by)
        VALUES (
          NEW.restaurant_id,
          'Compras de insumos',
          'Compras de insumos',
          _cat_id,
          NEW.total,
          _delivery_date,
          'supply_order:' || NEW.id::text,
          NEW.created_by
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
