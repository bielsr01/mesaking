-- Access groups per restaurant
CREATE TABLE IF NOT EXISTS public.access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_groups_restaurant ON public.access_groups(restaurant_id);

ALTER TABLE public.access_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager manages access groups"
  ON public.access_groups FOR ALL
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER trg_access_groups_updated_at
  BEFORE UPDATE ON public.access_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add access_group_id to restaurant_members
ALTER TABLE public.restaurant_members
  ADD COLUMN IF NOT EXISTS access_group_id uuid REFERENCES public.access_groups(id) ON DELETE SET NULL;

-- Allow managers to add/remove members of their own restaurant (currently only master_admin)
DROP POLICY IF EXISTS "Manager manages own members" ON public.restaurant_members;
CREATE POLICY "Manager manages own members"
  ON public.restaurant_members FOR ALL
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role));