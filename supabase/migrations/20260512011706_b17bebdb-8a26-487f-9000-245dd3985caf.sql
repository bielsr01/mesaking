
CREATE OR REPLACE FUNCTION public.handle_order_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _was_consumed boolean;
  _is_consumed boolean;
BEGIN
  _was_consumed := OLD.status IN ('accepted','preparing','awaiting_pickup','out_for_delivery','delivered');
  _is_consumed  := NEW.status IN ('accepted','preparing','awaiting_pickup','out_for_delivery','delivered');

  IF (NOT _was_consumed) AND _is_consumed THEN
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
$function$;

DROP TRIGGER IF EXISTS trg_handle_order_stock ON public.orders;
CREATE TRIGGER trg_handle_order_stock
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_stock();

DROP TRIGGER IF EXISTS trg_handle_supply_order_delivered ON public.supply_orders;
CREATE TRIGGER trg_handle_supply_order_delivered
AFTER UPDATE OF status ON public.supply_orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_supply_order_delivered();

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.supply_orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.supply_orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
