-- Alert config (single row) + audit log of fired stuck-recovery alerts
CREATE TABLE IF NOT EXISTS public.pricing_v2_alert_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stuck_minutes_threshold INT NOT NULL DEFAULT 30 CHECK (stuck_minutes_threshold >= 1),
  banner_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  email_recipients TEXT[] NOT NULL DEFAULT '{}',
  webhook_enabled BOOLEAN NOT NULL DEFAULT false,
  webhook_url TEXT,
  webhook_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.pricing_v2_alert_config (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pricing_v2_alert_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view alert config"
  ON public.pricing_v2_alert_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update alert config"
  ON public.pricing_v2_alert_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pricing_v2_alert_config_updated_at
  BEFORE UPDATE ON public.pricing_v2_alert_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log of fired alerts (one row per breach event; banner reads from here)
CREATE TABLE IF NOT EXISTS public.pricing_v2_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID,
  stage TEXT NOT NULL,
  stuck_for_minutes INT NOT NULL,
  threshold_minutes INT NOT NULL,
  message TEXT NOT NULL,
  channels JSONB NOT NULL DEFAULT '{}'::jsonb, -- { banner: true, email: {sent, recipients, error}, webhook: {sent, status, error} }
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_v2_alert_events_unack_idx
  ON public.pricing_v2_alert_events (created_at DESC)
  WHERE acknowledged_at IS NULL;

ALTER TABLE public.pricing_v2_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view alert events"
  ON public.pricing_v2_alert_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can acknowledge alert events"
  ON public.pricing_v2_alert_events FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));