CREATE POLICY "Public can view orders"
ON public.orders
FOR SELECT
USING (true);

CREATE POLICY "Public can view order items"
ON public.order_items
FOR SELECT
USING (true);