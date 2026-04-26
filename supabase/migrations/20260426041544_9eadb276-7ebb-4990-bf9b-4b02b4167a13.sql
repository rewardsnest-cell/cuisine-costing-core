
-- Keyword → product attribution per run
CREATE TABLE public.pricing_v2_catalog_keyword_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.pricing_v2_runs(run_id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  product_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pv2_kw_hits_uniq ON public.pricing_v2_catalog_keyword_hits(run_id, keyword, product_key);
CREATE INDEX pv2_kw_hits_run ON public.pricing_v2_catalog_keyword_hits(run_id);
CREATE INDEX pv2_kw_hits_keyword ON public.pricing_v2_catalog_keyword_hits(keyword);
CREATE INDEX pv2_kw_hits_product ON public.pricing_v2_catalog_keyword_hits(product_key);

ALTER TABLE public.pricing_v2_catalog_keyword_hits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage pv2 keyword hits"
  ON public.pricing_v2_catalog_keyword_hits FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Recurring keyword sweep schedules
CREATE TABLE public.pricing_v2_keyword_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cadence_hours INTEGER NOT NULL CHECK (cadence_hours >= 1 AND cadence_hours <= 24*30),
  keyword_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  keyword_limit INTEGER NOT NULL DEFAULT 250 CHECK (keyword_limit BETWEEN 1 AND 500),
  skip_weight_normalization BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_id UUID REFERENCES public.pricing_v2_runs(run_id) ON DELETE SET NULL,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pv2_kw_sched_due ON public.pricing_v2_keyword_schedules(next_run_at) WHERE enabled = true;

ALTER TABLE public.pricing_v2_keyword_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage pv2 kw schedules"
  ON public.pricing_v2_keyword_schedules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_pv2_kw_sched_updated
  BEFORE UPDATE ON public.pricing_v2_keyword_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
