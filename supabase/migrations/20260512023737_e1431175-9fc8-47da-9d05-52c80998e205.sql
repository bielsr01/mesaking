
-- Expense categories catalog (managed by master admin)
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  requires_description boolean NOT NULL DEFAULT false,
  scope text NOT NULL DEFAULT 'restaurant' CHECK (scope IN ('restaurant','admin')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope, name)
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories readable by authenticated"
  ON public.expense_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Master admin manages expense categories"
  ON public.expense_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER expense_categories_touch
  BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add category_id to expenses (link to catalog)
ALTER TABLE public.expenses ADD COLUMN category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL;

-- Admin's own expenses (separate from restaurants)
CREATE TABLE public.admin_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  category text,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT (now())::date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admin manages admin expenses"
  ON public.admin_expenses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER admin_expenses_touch
  BEFORE UPDATE ON public.admin_expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Allow master_admin to view all restaurant expenses (already allowed via existing policy)
