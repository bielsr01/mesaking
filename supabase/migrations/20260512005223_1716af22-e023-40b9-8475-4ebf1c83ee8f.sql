
-- Allow managers to update their own pending supply orders
CREATE POLICY "Manager updates pending supply orders"
ON public.supply_orders
FOR UPDATE
TO authenticated
USING (
  status = 'pending' AND (
    is_restaurant_manager(auth.uid(), restaurant_id)
    OR has_role(auth.uid(), 'master_admin'::app_role)
  )
)
WITH CHECK (
  is_restaurant_manager(auth.uid(), restaurant_id)
  OR has_role(auth.uid(), 'master_admin'::app_role)
);

-- Allow managers to delete their own pending supply orders
CREATE POLICY "Manager deletes pending supply orders"
ON public.supply_orders
FOR DELETE
TO authenticated
USING (
  status = 'pending' AND (
    is_restaurant_manager(auth.uid(), restaurant_id)
    OR has_role(auth.uid(), 'master_admin'::app_role)
  )
);

-- Allow managers to delete items of their own pending supply orders
CREATE POLICY "Manager deletes items of pending supply orders"
ON public.supply_order_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.supply_orders o
    WHERE o.id = supply_order_items.supply_order_id
      AND o.status = 'pending'
      AND (is_restaurant_manager(auth.uid(), o.restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
  )
);

-- Allow managers to delete option distributions of their own pending supply orders
CREATE POLICY "Manager deletes options of pending supply orders"
ON public.supply_order_item_options
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.supply_order_items i
    JOIN public.supply_orders o ON o.id = i.supply_order_id
    WHERE i.id = supply_order_item_options.supply_order_item_id
      AND o.status = 'pending'
      AND (is_restaurant_manager(auth.uid(), o.restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
  )
);
