
CREATE OR REPLACE FUNCTION public.upsert_customer_on_order(
  _restaurant_id uuid,
  _name text,
  _phone text,
  _address_cep text DEFAULT NULL,
  _address_street text DEFAULT NULL,
  _address_number text DEFAULT NULL,
  _address_complement text DEFAULT NULL,
  _address_neighborhood text DEFAULT NULL,
  _address_city text DEFAULT NULL,
  _address_state text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  _existing_id uuid;
  _existing_count int;
BEGIN
  IF length(_digits) < 10 THEN
    RETURN NULL;
  END IF;

  -- Procura cliente existente pelo telefone (qualquer formato) no mesmo restaurante
  SELECT id, orders_count INTO _existing_id, _existing_count
  FROM public.customers
  WHERE restaurant_id = _restaurant_id
    AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') = _digits
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    UPDATE public.customers SET
      name = COALESCE(NULLIF(_name, ''), name),
      phone = _phone,
      orders_count = COALESCE(_existing_count, 0) + 1,
      last_order_at = now(),
      address_cep = COALESCE(_address_cep, address_cep),
      address_street = COALESCE(_address_street, address_street),
      address_number = COALESCE(_address_number, address_number),
      address_complement = COALESCE(_address_complement, address_complement),
      address_neighborhood = COALESCE(_address_neighborhood, address_neighborhood),
      address_city = COALESCE(_address_city, address_city),
      address_state = COALESCE(_address_state, address_state),
      updated_at = now()
    WHERE id = _existing_id;
    RETURN _existing_id;
  ELSE
    INSERT INTO public.customers(
      restaurant_id, name, phone, orders_count, last_order_at,
      address_cep, address_street, address_number, address_complement,
      address_neighborhood, address_city, address_state
    ) VALUES (
      _restaurant_id, _name, _phone, 1, now(),
      _address_cep, _address_street, _address_number, _address_complement,
      _address_neighborhood, _address_city, _address_state
    )
    RETURNING id INTO _existing_id;
    RETURN _existing_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_customer_on_order(uuid, text, text, text, text, text, text, text, text, text) TO anon, authenticated;
