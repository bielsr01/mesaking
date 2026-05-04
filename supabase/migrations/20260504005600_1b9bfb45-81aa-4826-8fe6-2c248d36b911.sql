-- Settings table
CREATE TABLE public.loyalty_settings (
  restaurant_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  points_per_real numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Loyalty settings public read"
  ON public.loyalty_settings FOR SELECT USING (true);

CREATE POLICY "Manager manages loyalty settings"
  ON public.loyalty_settings FOR ALL
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER trg_loyalty_settings_updated
  BEFORE UPDATE ON public.loyalty_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Members table
CREATE TABLE public.loyalty_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, phone)
);
ALTER TABLE public.loyalty_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Loyalty members public insert"
  ON public.loyalty_members FOR INSERT WITH CHECK (true);

CREATE POLICY "Loyalty members public read by restaurant"
  ON public.loyalty_members FOR SELECT USING (true);

CREATE POLICY "Manager manages loyalty members"
  ON public.loyalty_members FOR ALL
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER trg_loyalty_members_updated
  BEFORE UPDATE ON public.loyalty_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Transactions table
CREATE TABLE public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES public.loyalty_members(id) ON DELETE CASCADE,
  order_id uuid,
  points integer NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'earn',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  credited_at timestamptz
);
CREATE INDEX idx_loyalty_tx_restaurant ON public.loyalty_transactions(restaurant_id, status);
CREATE INDEX idx_loyalty_tx_member ON public.loyalty_transactions(member_id);
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Loyalty tx public insert"
  ON public.loyalty_transactions FOR INSERT WITH CHECK (true);

CREATE POLICY "Manager manages loyalty tx"
  ON public.loyalty_transactions FOR ALL
  USING (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(auth.uid(), 'master_admin'::app_role));

-- Add opt-in column to orders
ALTER TABLE public.orders ADD COLUMN loyalty_opt_in boolean NOT NULL DEFAULT false;

-- Function to credit points
CREATE OR REPLACE FUNCTION public.credit_loyalty_points(_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx record;
BEGIN
  SELECT * INTO _tx FROM public.loyalty_transactions WHERE id = _tx_id FOR UPDATE;
  IF _tx IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF _tx.status = 'credited' THEN RETURN; END IF;
  UPDATE public.loyalty_transactions
    SET status = 'credited', credited_at = now()
    WHERE id = _tx_id;
  UPDATE public.loyalty_members
    SET points = points + _tx.points
    WHERE id = _tx.member_id;
END;
$$;