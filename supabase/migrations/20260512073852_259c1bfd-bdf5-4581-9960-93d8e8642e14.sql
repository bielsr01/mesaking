
CREATE OR REPLACE FUNCTION public.verify_restaurant_master_pin(_restaurant_id uuid, _pin text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stored text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'master_admin'::app_role)
          OR public.is_restaurant_manager(auth.uid(), _restaurant_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT pin INTO _stored FROM public.restaurant_master_pins WHERE restaurant_id = _restaurant_id;
  IF _stored IS NULL THEN
    RETURN false;
  END IF;
  RETURN _stored = _pin;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_restaurant_master_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_restaurant_master_pin(uuid, text) TO authenticated;
