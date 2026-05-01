
-- Allow master admin (and restaurant manager) to delete orders & order_items
CREATE POLICY "Master admin deletes orders" ON public.orders
FOR DELETE USING (public.has_role(auth.uid(), 'master_admin') OR public.is_restaurant_manager(auth.uid(), restaurant_id));

CREATE POLICY "Master admin deletes order items" ON public.order_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (public.has_role(auth.uid(), 'master_admin') OR public.is_restaurant_manager(auth.uid(), o.restaurant_id))
  )
);
