CREATE OR REPLACE FUNCTION public.get_restaurant_popup_config(_restaurant_id uuid)
RETURNS TABLE(popup_enabled boolean, popup_text text, popup_whatsapp_message text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT popup_enabled, popup_text, popup_whatsapp_message
  FROM public.evolution_integrations
  WHERE restaurant_id = _restaurant_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_restaurant_popup_config(uuid) TO anon, authenticated;