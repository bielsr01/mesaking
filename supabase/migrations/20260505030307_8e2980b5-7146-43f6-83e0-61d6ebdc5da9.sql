
-- Rewards catalog
CREATE TABLE public.loyalty_rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  product_id uuid NULL,
  name text NOT NULL,
  points_cost integer NOT NULL DEFAULT 0,
  stock integer NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Loyalty rewards public read active"
ON public.loyalty_rewards FOR SELECT
USING (is_active = true OR is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Manager manages loyalty rewards"
ON public.loyalty_rewards FOR ALL
USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER trg_loyalty_rewards_updated
BEFORE UPDATE ON public.loyalty_rewards
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Redeem function
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  _restaurant_id uuid,
  _member_id uuid,
  _reward_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reward record;
  _member record;
  _tx_id uuid;
BEGIN
  SELECT * INTO _reward FROM public.loyalty_rewards
    WHERE id = _reward_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF _reward IS NULL THEN RAISE EXCEPTION 'Recompensa não encontrada'; END IF;
  IF NOT _reward.is_active THEN RAISE EXCEPTION 'Recompensa inativa'; END IF;
  IF _reward.stock IS NOT NULL AND _reward.stock <= 0 THEN RAISE EXCEPTION 'Sem estoque'; END IF;

  SELECT * INTO _member FROM public.loyalty_members
    WHERE id = _member_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF _member IS NULL THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  IF _member.points < _reward.points_cost THEN RAISE EXCEPTION 'Pontos insuficientes'; END IF;

  UPDATE public.loyalty_members SET points = points - _reward.points_cost WHERE id = _member_id;

  IF _reward.stock IS NOT NULL THEN
    UPDATE public.loyalty_rewards SET stock = stock - 1 WHERE id = _reward_id;
  END IF;

  INSERT INTO public.loyalty_transactions (restaurant_id, member_id, points, type, status, credited_at)
  VALUES (_restaurant_id, _member_id, -_reward.points_cost, 'redeem', 'credited', now())
  RETURNING id INTO _tx_id;

  RETURN _tx_id;
END;
$$;
