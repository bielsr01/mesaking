
CREATE TABLE public.restaurant_master_pins (
  restaurant_id uuid NOT NULL PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  pin text NOT NULL CHECK (pin ~ '^[0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_master_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admin manages master pins"
ON public.restaurant_master_pins
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER tg_restaurant_master_pins_updated
BEFORE UPDATE ON public.restaurant_master_pins
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
