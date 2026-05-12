
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
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    FOR _item IN
      SELECT i.product_id, i.quantity, sp.stock_group_id, sp.total_quantity
      FROM public.supply_order_items i
      LEFT JOIN public.supply_products sp ON sp.id = i.product_id
      WHERE i.supply_order_id = NEW.id
    LOOP
      _gid := _item.stock_group_id;
      -- If product has a package size (total_quantity), multiply; otherwise use the raw quantity.
      _qty := _item.quantity * COALESCE(_item.total_quantity, 1);
      IF _gid IS NOT NULL AND _qty > 0 THEN
        PERFORM public.apply_stock_delta(NEW.restaurant_id, _gid, _qty,
          'supply_delivery'::stock_movement_type, NEW.id, 'Pedido de insumo entregue');
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;
