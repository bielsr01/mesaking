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
  _note text;
BEGIN
  -- Skip iFood orders (still in testing phase)
  IF NEW.external_source = 'ifood' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    _was_consumed := false;
  ELSE
    _was_consumed := OLD.status IN ('accepted','preparing','awaiting_pickup','out_for_delivery','delivered');
  END IF;
  _is_consumed := NEW.status IN ('accepted','preparing','awaiting_pickup','out_for_delivery','delivered');

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
    IF NEW.status = 'cancelled' THEN
      _note := 'Pedido cancelado - crédito de estoque';
    ELSE
      _note := 'Pedido revertido';
    END IF;
    FOR _row IN
      SELECT psc.group_id, SUM(oi.quantity * psc.quantity_per_unit)::int AS qty
      FROM public.order_items oi
      JOIN public.product_stock_consumption psc ON psc.product_id = oi.product_id
      WHERE oi.order_id = NEW.id
      GROUP BY psc.group_id
    LOOP
      IF _row.qty > 0 THEN
        PERFORM public.apply_stock_delta(NEW.restaurant_id, _row.group_id, _row.qty,
          'order_revert'::stock_movement_type, NEW.id, _note);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger on order_items: when items are inserted into an already-consumed order
-- that has no consumption movement yet (typical for PDV which creates order with
-- status='preparing' BEFORE inserting items in a separate transaction), apply
-- the consumption now. Safeguarded against double-counting via existence check.
CREATE OR REPLACE FUNCTION public.handle_order_item_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _order record;
  _qty int;
  _row record;
BEGIN
  SELECT id, restaurant_id, status, external_source INTO _order
  FROM public.orders WHERE id = NEW.order_id;

  IF _order.id IS NULL THEN RETURN NEW; END IF;
  IF _order.external_source = 'ifood' THEN RETURN NEW; END IF;
  IF _order.status NOT IN ('accepted','preparing','awaiting_pickup','out_for_delivery','delivered') THEN
    RETURN NEW;
  END IF;

  -- Avoid double-consume: only act if no order_consumption movement exists yet for this order
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_id = _order.id AND type = 'order_consumption'::stock_movement_type
  ) THEN
    RETURN NEW;
  END IF;

  FOR _row IN
    SELECT psc.group_id, (NEW.quantity * psc.quantity_per_unit)::int AS qty
    FROM public.product_stock_consumption psc
    WHERE psc.product_id = NEW.product_id
  LOOP
    IF _row.qty > 0 THEN
      PERFORM public.apply_stock_delta(_order.restaurant_id, _row.group_id, -_row.qty,
        'order_consumption'::stock_movement_type, _order.id, 'Pedido aceito');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_handle_order_item_stock ON public.order_items;
CREATE TRIGGER trg_handle_order_item_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_item_stock();