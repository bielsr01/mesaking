ALTER TABLE public.restaurants
ADD COLUMN IF NOT EXISTS kitchen_print_settings jsonb NOT NULL DEFAULT '{"logo": true, "business_name": true, "business_address": false, "order_type_date": true, "customer_name": true, "customer_address": true, "customer_phone": true, "products": true, "prices": false, "payment_method": false}'::jsonb;

-- Migrate existing print_settings: replace legacy products_with_prices with split fields if not present
UPDATE public.restaurants
SET print_settings = print_settings
  || jsonb_build_object(
       'products', COALESCE((print_settings->>'products')::boolean, COALESCE((print_settings->>'products_with_prices')::boolean, true)),
       'prices', COALESCE((print_settings->>'prices')::boolean, COALESCE((print_settings->>'products_with_prices')::boolean, true)),
       'payment_method', COALESCE((print_settings->>'payment_method')::boolean, true)
     );

-- Update default for print_settings to new structure
ALTER TABLE public.restaurants
ALTER COLUMN print_settings SET DEFAULT '{"logo": true, "business_name": true, "business_address": true, "order_type_date": true, "customer_name": true, "customer_address": true, "customer_phone": true, "products": true, "prices": true, "payment_method": true}'::jsonb;