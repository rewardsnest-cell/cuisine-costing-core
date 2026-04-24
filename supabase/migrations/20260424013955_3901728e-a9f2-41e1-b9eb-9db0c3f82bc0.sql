
CREATE TABLE IF NOT EXISTS public.kroger_ingest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','skipped')),
  triggered_by UUID,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  items_queried INT NOT NULL DEFAULT 0,
  price_rows_written INT NOT NULL DEFAULT 0,
  sku_map_rows_touched INT NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  message TEXT,
  location_id TEXT,
  item_limit INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kroger_ingest_runs_created ON public.kroger_ingest_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kroger_ingest_runs_status ON public.kroger_ingest_runs (status);

ALTER TABLE public.kroger_ingest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read kroger ingest runs"
  ON public.kroger_ingest_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert kroger ingest runs"
  ON public.kroger_ingest_runs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update kroger ingest runs"
  ON public.kroger_ingest_runs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
