
-- 1) Table to store selected option items per order_item (with stock linkage)
CREATE TABLE IF NOT EXISTS public.order_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  option_item_id uuid NULL REFERENCES public.option_items(id) ON DELETE SET NULL,
  group_name text NULL,
  item_name text NULL,
  extra_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oio_order_item ON public.order_item_options(order_item_id);
CREATE INDEX IF NOT EXISTS idx_oio_option_item ON public.order_item_options(option_item_id);

ALTER TABLE public.order_item_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can create order item options" ON public.order_item_options;
CREATE POLICY "Anyone can create order item options"
ON public.order_item_options FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view order item options" ON public.order_item_options;
CREATE POLICY "Public can view order item options"
ON public.order_item_options FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Manager deletes order item options" ON public.order_item_options;
CREATE POLICY "Manager deletes order item options"
ON public.order_item_options FOR DELETE TO public
USING (EXISTS (
  SELECT 1 FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = order_item_options.order_item_id
    AND (public.is_restaurant_manager(auth.uid(), o.restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role))
));

-- 2) Recompute function: idempotent reconciliation of stock for an order
CREATE OR REPLACE FUNCTION public.recompute_order_stock(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ord record;
  _consumed boolean;
  _r record;
  _desired int;
  _applied int;
  _delta int;
  _note text;
  _mtype stock_movement_type;
BEGIN
  SELECT id, restaurant_id, status, external_source INTO _ord
    FROM public.orders WHERE id = _order_id;
  IF _ord.id IS NULL THEN RETURN; END IF;
  IF _ord.external_source = 'ifood' THEN RETURN; END IF;

  _consumed := _ord.status IN ('accepted','preparing','awaiting_pickup','out_for_delivery','delivered');

  -- Iterate over the union of: groups that should be consumed AND groups that already have movements
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
    -- Target net movement for this order = -desired (consumption is negative)
    -- Delta to apply = target - applied_net
    _delta := (-_desired) - _r.applied_net;
    IF _delta = 0 THEN CONTINUE; END IF;

    IF _delta < 0 THEN
      _mtype := 'order_consumption'::stock_movement_type;
      _note := 'Pedido aceito';
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
$$;

-- 3) Replace order trigger to use recompute
CREATE OR REPLACE FUNCTION public.handle_order_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_order_stock(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_order_stock ON public.orders;
CREATE TRIGGER trg_handle_order_stock
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_order_stock();

-- 4) Replace order_items trigger to use recompute
CREATE OR REPLACE FUNCTION public.handle_order_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_order_stock(NEW.order_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_order_item_stock ON public.order_items;
CREATE TRIGGER trg_handle_order_item_stock
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.handle_order_item_stock();

-- 5) New trigger on order_item_options
CREATE OR REPLACE FUNCTION public.handle_order_item_option_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _oid uuid;
BEGIN
  SELECT order_id INTO _oid FROM public.order_items WHERE id = NEW.order_item_id;
  IF _oid IS NOT NULL THEN
    PERFORM public.recompute_order_stock(_oid);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_order_item_option_stock ON public.order_item_options;
CREATE TRIGGER trg_handle_order_item_option_stock
AFTER INSERT ON public.order_item_options
FOR EACH ROW EXECUTE FUNCTION public.handle_order_item_option_stock();
