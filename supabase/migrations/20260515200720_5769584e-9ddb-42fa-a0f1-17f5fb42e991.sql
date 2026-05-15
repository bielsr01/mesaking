
CREATE TABLE public.order_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, product_id)
);

CREATE INDEX idx_order_suggestions_restaurant ON public.order_suggestions(restaurant_id);

ALTER TABLE public.order_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order suggestions public read"
ON public.order_suggestions
FOR SELECT
USING (true);

CREATE POLICY "Manager manages order suggestions"
ON public.order_suggestions
FOR ALL
USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));
