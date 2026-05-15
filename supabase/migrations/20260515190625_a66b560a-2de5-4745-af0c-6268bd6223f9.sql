
-- 1) Helper: normaliza telefone BR adicionando 9º dígito quando faltar
CREATE OR REPLACE FUNCTION public.normalize_br_phone(_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
BEGIN
  IF d = '' THEN RETURN _phone; END IF;
  -- remove DDI 55
  IF length(d) = 13 AND left(d,2) = '55' THEN d := substr(d, 3); END IF;
  IF length(d) = 12 AND left(d,2) = '55' THEN d := substr(d, 3); END IF;
  -- adiciona 9º dígito (DDD + 8 -> DDD + 9 + 8)
  IF length(d) = 10 THEN
    d := substr(d,1,2) || '9' || substr(d,3);
  END IF;
  IF length(d) = 11 THEN
    RETURN '(' || substr(d,1,2) || ')' || substr(d,3,5) || '-' || substr(d,8,4);
  END IF;
  IF length(d) = 10 THEN
    RETURN '(' || substr(d,1,2) || ')' || substr(d,3,4) || '-' || substr(d,7,4);
  END IF;
  RETURN _phone;
END;
$$;

-- 2) Backfill loyalty_members: mescla duplicados
DO $$
DECLARE
  r record;
  keep_id uuid;
  drop_id uuid;
  norm text;
BEGIN
  FOR r IN
    SELECT restaurant_id, normalize_br_phone(phone) AS norm_phone, array_agg(id ORDER BY points DESC, created_at ASC) AS ids
    FROM public.loyalty_members
    WHERE normalize_br_phone(phone) IS NOT NULL
    GROUP BY restaurant_id, normalize_br_phone(phone)
    HAVING count(*) > 1
  LOOP
    keep_id := r.ids[1];
    FOR i IN 2..array_length(r.ids,1) LOOP
      drop_id := r.ids[i];
      UPDATE public.loyalty_members
        SET points = points + COALESCE((SELECT points FROM public.loyalty_members WHERE id = drop_id),0)
        WHERE id = keep_id;
      UPDATE public.loyalty_transactions SET member_id = keep_id WHERE member_id = drop_id;
      DELETE FROM public.loyalty_members WHERE id = drop_id;
    END LOOP;
  END LOOP;
END $$;

-- atualiza telefones remanescentes para o formato normalizado
UPDATE public.loyalty_members
SET phone = normalize_br_phone(phone)
WHERE phone IS DISTINCT FROM normalize_br_phone(phone);

-- 3) Backfill customers: mescla duplicados
DO $$
DECLARE
  r record;
  keep_id uuid;
  drop_id uuid;
  drop_row record;
BEGIN
  FOR r IN
    SELECT restaurant_id, normalize_br_phone(phone) AS norm_phone, array_agg(id ORDER BY orders_count DESC NULLS LAST, created_at ASC) AS ids
    FROM public.customers
    WHERE normalize_br_phone(phone) IS NOT NULL
    GROUP BY restaurant_id, normalize_br_phone(phone)
    HAVING count(*) > 1
  LOOP
    keep_id := r.ids[1];
    FOR i IN 2..array_length(r.ids,1) LOOP
      drop_id := r.ids[i];
      SELECT * INTO drop_row FROM public.customers WHERE id = drop_id;
      UPDATE public.customers k SET
        orders_count = COALESCE(k.orders_count,0) + COALESCE(drop_row.orders_count,0),
        last_order_at = GREATEST(COALESCE(k.last_order_at, 'epoch'::timestamptz), COALESCE(drop_row.last_order_at, 'epoch'::timestamptz)),
        name = COALESCE(NULLIF(k.name,''), drop_row.name),
        email = COALESCE(k.email, drop_row.email),
        address_cep = COALESCE(k.address_cep, drop_row.address_cep),
        address_street = COALESCE(k.address_street, drop_row.address_street),
        address_number = COALESCE(k.address_number, drop_row.address_number),
        address_complement = COALESCE(k.address_complement, drop_row.address_complement),
        address_neighborhood = COALESCE(k.address_neighborhood, drop_row.address_neighborhood),
        address_city = COALESCE(k.address_city, drop_row.address_city),
        address_state = COALESCE(k.address_state, drop_row.address_state),
        notes = COALESCE(k.notes, drop_row.notes),
        updated_at = now()
      WHERE k.id = keep_id;
      DELETE FROM public.customers WHERE id = drop_id;
    END LOOP;
  END LOOP;
END $$;

UPDATE public.customers
SET phone = normalize_br_phone(phone)
WHERE phone IS DISTINCT FROM normalize_br_phone(phone);

-- 4) Trigger BEFORE INSERT OR UPDATE para normalizar telefone automaticamente
CREATE OR REPLACE FUNCTION public.tg_normalize_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := public.normalize_br_phone(NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_normalize_phone ON public.customers;
CREATE TRIGGER trg_customers_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone();

DROP TRIGGER IF EXISTS trg_loyalty_members_normalize_phone ON public.loyalty_members;
CREATE TRIGGER trg_loyalty_members_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.loyalty_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone();

-- 5) Atualiza upsert_customer_on_order para normalizar antes de procurar duplicado
CREATE OR REPLACE FUNCTION public.upsert_customer_on_order(_restaurant_id uuid, _name text, _phone text, _address_cep text DEFAULT NULL::text, _address_street text DEFAULT NULL::text, _address_number text DEFAULT NULL::text, _address_complement text DEFAULT NULL::text, _address_neighborhood text DEFAULT NULL::text, _address_city text DEFAULT NULL::text, _address_state text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _normalized text := public.normalize_br_phone(_phone);
  _digits text := regexp_replace(coalesce(_normalized, ''), '\D', '', 'g');
  _existing_id uuid;
  _existing_count int;
BEGIN
  IF length(_digits) < 10 THEN
    RETURN NULL;
  END IF;

  -- Procura cliente existente pelo telefone normalizado (apenas dígitos) no mesmo restaurante
  SELECT id, orders_count INTO _existing_id, _existing_count
  FROM public.customers
  WHERE restaurant_id = _restaurant_id
    AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') = _digits
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    UPDATE public.customers SET
      name = COALESCE(NULLIF(_name, ''), name),
      phone = _normalized,
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
      _restaurant_id, _name, _normalized, 1, now(),
      _address_cep, _address_street, _address_number, _address_complement,
      _address_neighborhood, _address_city, _address_state
    )
    RETURNING id INTO _existing_id;
    RETURN _existing_id;
  END IF;
END;
$function$;
