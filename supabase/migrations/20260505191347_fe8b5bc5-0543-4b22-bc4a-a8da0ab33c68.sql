
CREATE TABLE public.ifood_sales (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  orders_count integer NOT NULL DEFAULT 0,
  gross_revenue numeric NOT NULL DEFAULT 0,
  net_revenue numeric NOT NULL DEFAULT 0,
  fees numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ifood_sales_restaurant_date ON public.ifood_sales(restaurant_id, date_from, date_to);

ALTER TABLE public.ifood_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager views ifood sales" ON public.ifood_sales FOR SELECT TO authenticated
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Manager inserts ifood sales" ON public.ifood_sales FOR INSERT TO authenticated
  WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Manager updates ifood sales" ON public.ifood_sales FOR UPDATE TO authenticated
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Manager deletes ifood sales" ON public.ifood_sales FOR DELETE TO authenticated
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'));

CREATE TRIGGER ifood_sales_touch BEFORE UPDATE ON public.ifood_sales
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
