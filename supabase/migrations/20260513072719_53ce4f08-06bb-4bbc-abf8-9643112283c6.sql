CREATE POLICY "Managers view profiles of restaurant peers"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE public.is_restaurant_manager(auth.uid(), r.id)
      AND (r.owner_id = profiles.id OR EXISTS (
        SELECT 1 FROM public.restaurant_members m
        WHERE m.restaurant_id = r.id AND m.user_id = profiles.id
      ))
  )
);