CREATE OR REPLACE FUNCTION public.recompute_order_stock(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ord record;
  _consumed boolean;
  _r record;
  _desired int;
  _delta int;
  _note text;
  _mtype stock_movement_type;
BEGIN
  SELECT id, restaurant_id, status, external_source, order_type INTO _ord
    FROM public.orders WHERE id = _order_id;
  IF _ord.id IS NULL THEN RETURN; END IF;
  IF _ord.external_source = 'ifood' THEN RETURN; END IF;

  -- PDV consome estoque somente quando entregue.
  -- Demais tipos consomem em qualquer status ativo.
  IF _ord.order_type = 'pdv' THEN
    _consumed := _ord.status = 'delivered';
  ELSE
    _consumed := _ord.status IN ('accepted','preparing','awaiting_pickup','out_for_delivery','delivered');
  END IF;

  FOR _r IN
    WITH desired AS (
      SELECT psc.group_id, SUM(oi.quantity * psc.quantity_per_unit)::int AS qty
        FROM public.order_items oi
        JOIN public.product_stock_consumption psc ON psc.product_id = oi.product_id
        WHERE oi.order_id = _order_id
        GROUP BY psc.group_id
      UNION ALL
      SELECT opi.stock_group_id AS group_id,
             SUM(oi.quantity * opi.stock_quantity_per_unit)::int AS qty
        FROM public.order_items oi
        JOIN public.order_item_options oio ON oio.order_item_id = oi.id
        JOIN public.option_items opi ON opi.id = oio.option_item_id
        WHERE oi.order_id = _order_id
          AND opi.stock_group_id IS NOT NULL
        GROUP BY opi.stock_group_id
    ),
    desired_agg AS (
      SELECT group_id, SUM(qty)::int AS qty FROM desired GROUP BY group_id
    ),
    existing AS (
      SELECT group_id, SUM(quantity)::int AS net
        FROM public.stock_movements
        WHERE reference_id = _order_id
          AND type IN ('order_consumption'::stock_movement_type,'order_revert'::stock_movement_type)
        GROUP BY group_id
    )
    SELECT COALESCE(d.group_id, e.group_id) AS group_id,
           COALESCE(d.qty, 0) AS desired_qty,
           COALESCE(e.net, 0) AS applied_net
      FROM desired_agg d
      FULL OUTER JOIN existing e ON e.group_id = d.group_id
  LOOP
    _desired := CASE WHEN _consumed THEN _r.desired_qty ELSE 0 END;
    _delta := (-_desired) - _r.applied_net;
    IF _delta = 0 THEN CONTINUE; END IF;

    IF _delta < 0 THEN
      _mtype := 'order_consumption'::stock_movement_type;
      _note := CASE WHEN _ord.order_type = 'pdv' THEN 'PDV entregue' ELSE 'Pedido aceito' END;
    ELSE
      _mtype := 'order_revert'::stock_movement_type;
      _note := CASE WHEN _ord.status = 'cancelled'
                    THEN 'Pedido cancelado - crédito de estoque'
                    ELSE 'Pedido revertido' END;
    END IF;

    PERFORM public.apply_stock_delta(_ord.restaurant_id, _r.group_id, _delta,
      _mtype, _order_id, _note);
  END LOOP;
END;
$function$;