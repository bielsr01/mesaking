
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  address_cep text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  notes text,
  orders_count integer NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, phone)
);

CREATE INDEX idx_customers_restaurant ON public.customers(restaurant_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager manages customers"
ON public.customers FOR ALL
USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

-- Allow public (anonymous checkout) to upsert their own customer record by phone
CREATE POLICY "Anyone can insert customer"
ON public.customers FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update customer by phone"
ON public.customers FOR UPDATE
USING (true);

CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
