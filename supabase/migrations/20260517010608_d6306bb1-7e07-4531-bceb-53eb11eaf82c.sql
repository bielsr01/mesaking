
-- Cash flow tables
CREATE TYPE public.cash_session_status AS ENUM ('open', 'closed');
CREATE TYPE public.cash_movement_type AS ENUM ('order_cash','change_out','withdrawal','supply','adjustment','opening');

CREATE TABLE public.cash_register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_amount numeric NOT NULL DEFAULT 0,
  opening_notes text,
  closed_by uuid,
  closed_at timestamptz,
  closing_cash_bills numeric,
  closing_cash_coins numeric,
  closing_notes text,
  expected_cash numeric,
  counted_cash numeric,
  difference numeric,
  status public.cash_session_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_session_per_restaurant ON public.cash_register_sessions(restaurant_id) WHERE status = 'open';
CREATE INDEX idx_css_restaurant ON public.cash_register_sessions(restaurant_id, opened_at DESC);

CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  session_id uuid REFERENCES public.cash_register_sessions(id) ON DELETE CASCADE,
  order_id uuid,
  type public.cash_movement_type NOT NULL,
  amount numeric NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cm_session ON public.cash_movements(session_id, created_at);
CREATE INDEX idx_cm_restaurant ON public.cash_movements(restaurant_id, created_at DESC);

CREATE TABLE public.cash_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.cash_register_sessions(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cw_session ON public.cash_withdrawals(session_id, created_at);

CREATE TABLE public.payment_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cash_register_sessions(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL,
  method text NOT NULL,
  platform text NOT NULL,
  gross numeric NOT NULL DEFAULT 0,
  fees numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  orders_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.operator_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  session_id uuid,
  actor_id uuid,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ol_restaurant ON public.operator_logs(restaurant_id, created_at DESC);

-- RLS
ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager manages sessions" ON public.cash_register_sessions
  FOR ALL TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'master_admin'))
  WITH CHECK (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'master_admin'));

CREATE POLICY "Manager manages movements" ON public.cash_movements
  FOR ALL TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'master_admin'))
  WITH CHECK (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'master_admin'));

CREATE POLICY "Manager manages withdrawals" ON public.cash_withdrawals
  FOR ALL TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'master_admin'))
  WITH CHECK (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'master_admin'));

CREATE POLICY "Manager manages reconciliation" ON public.payment_reconciliation
  FOR ALL TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'master_admin'))
  WITH CHECK (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'master_admin'));

CREATE POLICY "Manager views logs" ON public.operator_logs
  FOR SELECT TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'master_admin'));
CREATE POLICY "Manager inserts logs" ON public.operator_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(),'master_admin'));

-- updated_at trigger
CREATE TRIGGER trg_css_updated BEFORE UPDATE ON public.cash_register_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_register_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_withdrawals;

-- Functions
CREATE OR REPLACE FUNCTION public.cash_session_open(
  _restaurant_id uuid, _opening_amount numeric, _notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _uid uuid := auth.uid();
BEGIN
  IF NOT (public.is_restaurant_manager(_uid, _restaurant_id) OR public.has_role(_uid,'master_admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_register_sessions WHERE restaurant_id=_restaurant_id AND status='open') THEN
    RAISE EXCEPTION 'Já existe um caixa aberto';
  END IF;
  INSERT INTO public.cash_register_sessions(restaurant_id, opened_by, opening_amount, opening_notes)
    VALUES (_restaurant_id, _uid, COALESCE(_opening_amount,0), _notes) RETURNING id INTO _id;
  INSERT INTO public.cash_movements(restaurant_id, session_id, type, amount, description, created_by)
    VALUES (_restaurant_id, _id, 'opening', COALESCE(_opening_amount,0), 'Abertura de caixa', _uid);
  INSERT INTO public.operator_logs(restaurant_id, session_id, actor_id, action, entity, entity_id, details)
    VALUES (_restaurant_id, _id, _uid, 'session_open', 'cash_register_sessions', _id, jsonb_build_object('opening_amount',_opening_amount));
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.cash_session_close(
  _session_id uuid, _counted_cash numeric, _bills numeric, _coins numeric, _notes text, _expected numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s record; _uid uuid := auth.uid();
BEGIN
  SELECT * INTO _s FROM public.cash_register_sessions WHERE id=_session_id FOR UPDATE;
  IF _s IS NULL THEN RAISE EXCEPTION 'Sessão não encontrada'; END IF;
  IF NOT (public.is_restaurant_manager(_uid, _s.restaurant_id) OR public.has_role(_uid,'master_admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _s.status='closed' THEN RAISE EXCEPTION 'Caixa já fechado'; END IF;
  UPDATE public.cash_register_sessions SET
    status='closed', closed_by=_uid, closed_at=now(),
    counted_cash=_counted_cash, closing_cash_bills=_bills, closing_cash_coins=_coins,
    closing_notes=_notes, expected_cash=_expected,
    difference=COALESCE(_counted_cash,0)-COALESCE(_expected,0)
    WHERE id=_session_id;
  INSERT INTO public.operator_logs(restaurant_id, session_id, actor_id, action, entity, entity_id, details)
    VALUES (_s.restaurant_id, _session_id, _uid, 'session_close', 'cash_register_sessions', _session_id,
      jsonb_build_object('counted',_counted_cash,'expected',_expected,'difference',_counted_cash-_expected));
END; $$;

CREATE OR REPLACE FUNCTION public.cash_add_withdrawal(
  _session_id uuid, _amount numeric, _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s record; _id uuid; _uid uuid := auth.uid();
BEGIN
  SELECT * INTO _s FROM public.cash_register_sessions WHERE id=_session_id;
  IF _s IS NULL THEN RAISE EXCEPTION 'Sessão não encontrada'; END IF;
  IF NOT (public.is_restaurant_manager(_uid, _s.restaurant_id) OR public.has_role(_uid,'master_admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _s.status='closed' THEN RAISE EXCEPTION 'Caixa fechado'; END IF;
  IF _amount<=0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  INSERT INTO public.cash_withdrawals(restaurant_id, session_id, amount, reason, created_by)
    VALUES (_s.restaurant_id, _session_id, _amount, _reason, _uid) RETURNING id INTO _id;
  INSERT INTO public.cash_movements(restaurant_id, session_id, type, amount, description, created_by)
    VALUES (_s.restaurant_id, _session_id, 'withdrawal', -_amount, COALESCE(_reason,'Sangria'), _uid);
  INSERT INTO public.operator_logs(restaurant_id, session_id, actor_id, action, entity, entity_id, details)
    VALUES (_s.restaurant_id, _session_id, _uid, 'withdrawal', 'cash_withdrawals', _id, jsonb_build_object('amount',_amount,'reason',_reason));
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.cash_add_supply(
  _session_id uuid, _amount numeric, _description text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s record; _id uuid; _uid uuid := auth.uid();
BEGIN
  SELECT * INTO _s FROM public.cash_register_sessions WHERE id=_session_id;
  IF _s IS NULL THEN RAISE EXCEPTION 'Sessão não encontrada'; END IF;
  IF NOT (public.is_restaurant_manager(_uid, _s.restaurant_id) OR public.has_role(_uid,'master_admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _s.status='closed' THEN RAISE EXCEPTION 'Caixa fechado'; END IF;
  IF _amount<=0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  INSERT INTO public.cash_movements(restaurant_id, session_id, type, amount, description, created_by)
    VALUES (_s.restaurant_id, _session_id, 'supply', _amount, COALESCE(_description,'Suprimento'), _uid) RETURNING id INTO _id;
  INSERT INTO public.operator_logs(restaurant_id, session_id, actor_id, action, entity, entity_id, details)
    VALUES (_s.restaurant_id, _session_id, _uid, 'supply', 'cash_movements', _id, jsonb_build_object('amount',_amount));
  RETURN _id;
END; $$;
