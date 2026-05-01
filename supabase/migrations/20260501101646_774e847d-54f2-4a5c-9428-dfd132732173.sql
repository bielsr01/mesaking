-- Adiciona número sequencial de pedido por restaurante, iniciando em 1000
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1000 INCREMENT BY 1 MINVALUE 1000;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number INTEGER;

-- Backfill para pedidos existentes
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE order_number IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.orders SET order_number = nextval('public.order_number_seq') WHERE id = r.id;
  END LOOP;
END $$;

-- Trigger para atribuir número automaticamente em novos pedidos
CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := nextval('public.order_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_number ON public.orders;
CREATE TRIGGER set_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_order_number();

ALTER TABLE public.orders ALTER COLUMN order_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_key ON public.orders(order_number);