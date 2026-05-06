
-- Evolution API integrations (per restaurant + admin global with restaurant_id IS NULL)
CREATE TABLE public.evolution_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid UNIQUE,
  is_admin boolean NOT NULL DEFAULT false,
  api_url text NOT NULL,
  api_key text NOT NULL,
  instance_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_status text,
  last_check_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX evolution_admin_singleton ON public.evolution_integrations((1)) WHERE is_admin = true;
ALTER TABLE public.evolution_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admin manages evolution"
  ON public.evolution_integrations FOR ALL TO public
  USING (has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Manager manages own evolution"
  ON public.evolution_integrations FOR ALL TO public
  USING (restaurant_id IS NOT NULL AND is_restaurant_manager(auth.uid(), restaurant_id))
  WITH CHECK (restaurant_id IS NOT NULL AND is_restaurant_manager(auth.uid(), restaurant_id));

CREATE TRIGGER evolution_integrations_touch BEFORE UPDATE ON public.evolution_integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Bulk campaigns
CREATE TYPE public.bulk_campaign_status AS ENUM ('draft','running','paused','completed','failed');
CREATE TYPE public.bulk_recipient_status AS ENUM ('pending','sent','failed');

CREATE TABLE public.bulk_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid,
  is_admin boolean NOT NULL DEFAULT false,
  created_by uuid,
  name text NOT NULL,
  message_text text NOT NULL,
  media_url text,
  interval_seconds integer NOT NULL DEFAULT 8,
  status public.bulk_campaign_status NOT NULL DEFAULT 'draft',
  total integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bulk_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admin manages campaigns"
  ON public.bulk_campaigns FOR ALL TO public
  USING (has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Manager manages own campaigns"
  ON public.bulk_campaigns FOR ALL TO public
  USING (restaurant_id IS NOT NULL AND is_restaurant_manager(auth.uid(), restaurant_id))
  WITH CHECK (restaurant_id IS NOT NULL AND is_restaurant_manager(auth.uid(), restaurant_id));

CREATE TRIGGER bulk_campaigns_touch BEFORE UPDATE ON public.bulk_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Recipients
CREATE TABLE public.bulk_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.bulk_campaigns(id) ON DELETE CASCADE,
  customer_id uuid,
  name text,
  phone text NOT NULL,
  status public.bulk_recipient_status NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bulk_recipients_campaign_status ON public.bulk_campaign_recipients(campaign_id, status);
ALTER TABLE public.bulk_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients access via campaign"
  ON public.bulk_campaign_recipients FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.bulk_campaigns c
    WHERE c.id = campaign_id
      AND (has_role(auth.uid(),'master_admin'::app_role)
        OR (c.restaurant_id IS NOT NULL AND is_restaurant_manager(auth.uid(), c.restaurant_id)))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bulk_campaigns c
    WHERE c.id = campaign_id
      AND (has_role(auth.uid(),'master_admin'::app_role)
        OR (c.restaurant_id IS NOT NULL AND is_restaurant_manager(auth.uid(), c.restaurant_id)))
  ));
