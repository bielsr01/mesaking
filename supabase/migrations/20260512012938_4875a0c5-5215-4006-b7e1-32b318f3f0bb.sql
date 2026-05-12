
-- Remove triggers duplicados que causavam desconto em dobro
DROP TRIGGER IF EXISTS orders_stock_trg ON public.orders;
DROP TRIGGER IF EXISTS supply_orders_delivered_trg ON public.supply_orders;

-- Atualiza handle_order_stock para também rodar em INSERT (PDV cria já como aceito)
-- e marcar nota como "Pedido cancelado" quando reverter
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

-- Trigger único de UPDATE (o duplicado já foi removido acima)
-- trg_handle_order_stock continua existindo

-- Novo trigger: AFTER INSERT para PDV (que já cria o pedido como aceito)
-- Roda DEFERRED para que os order_items já tenham sido inseridos
CREATE CONSTRAINT TRIGGER trg_handle_order_stock_insert
AFTER INSERT ON public.orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.handle_order_stock();
