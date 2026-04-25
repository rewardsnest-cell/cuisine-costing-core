-- Pricing v2: shared run + error infrastructure

CREATE TYPE public.pricing_v2_stage AS ENUM (
  'catalog',
  'monthly_snapshot',
  'receipts',
  'normalize',
  'compute_costs',
  'rollups'
);

CREATE TYPE public.pricing_v2_run_status AS ENUM (
  'queued',
  'running',
  'success',
  'partial',
  'failed',
  'skipped'
);

CREATE TYPE public.pricing_v2_severity AS ENUM (
  'info',
  'warning',
  'error',
  'critical'
);

CREATE TABLE public.pricing_v2_runs (
  run_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage public.pricing_v2_stage NOT NULL,
  status public.pricing_v2_run_status NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  counts_in INT NOT NULL DEFAULT 0,
  counts_out INT NOT NULL DEFAULT 0,
  warnings_count INT NOT NULL DEFAULT 0,
  errors_count INT NOT NULL DEFAULT 0,
  initiated_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricing_v2_runs_stage_started ON public.pricing_v2_runs(stage, started_at DESC);
CREATE INDEX idx_pricing_v2_runs_status ON public.pricing_v2_runs(status);

CREATE TABLE public.pricing_v2_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.pricing_v2_runs(run_id) ON DELETE SET NULL,
  stage public.pricing_v2_stage NOT NULL,
  severity public.pricing_v2_severity NOT NULL DEFAULT 'error',
  type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  message TEXT NOT NULL,
  suggested_fix TEXT,
  debug_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricing_v2_errors_stage ON public.pricing_v2_errors(stage, created_at DESC);
CREATE INDEX idx_pricing_v2_errors_severity ON public.pricing_v2_errors(severity);
CREATE INDEX idx_pricing_v2_errors_type ON public.pricing_v2_errors(type);
CREATE INDEX idx_pricing_v2_errors_run ON public.pricing_v2_errors(run_id);

CREATE TABLE public.pricing_v2_settings (
  id INT PRIMARY KEY DEFAULT 1,
  kroger_store_id TEXT NOT NULL DEFAULT '01400376',
  kroger_zip TEXT NOT NULL DEFAULT '45202',
  monthly_schedule_day INT NOT NULL DEFAULT 1,
  monthly_schedule_hour INT NOT NULL DEFAULT 6,
  warning_threshold_pct NUMERIC NOT NULL DEFAULT 10.0,
  zero_cost_blocking BOOLEAN NOT NULL DEFAULT true,
  default_menu_multiplier NUMERIC NOT NULL DEFAULT 3.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pricing_v2_settings_singleton CHECK (id = 1)
);

INSERT INTO public.pricing_v2_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- RLS: admins only via has_role()
ALTER TABLE public.pricing_v2_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_v2_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_v2_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read pricing_v2_runs"
  ON public.pricing_v2_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write pricing_v2_runs"
  ON public.pricing_v2_runs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read pricing_v2_errors"
  ON public.pricing_v2_errors FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write pricing_v2_errors"
  ON public.pricing_v2_errors FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read pricing_v2_settings"
  ON public.pricing_v2_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write pricing_v2_settings"
  ON public.pricing_v2_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pricing_v2_settings_updated_at
  BEFORE UPDATE ON public.pricing_v2_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();