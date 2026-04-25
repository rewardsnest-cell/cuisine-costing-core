-- Stage 0 bootstrap state: one row per store_id
CREATE TYPE public.pricing_v2_bootstrap_status AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED'
);

CREATE TABLE public.pricing_v2_catalog_bootstrap_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL UNIQUE,
  status public.pricing_v2_bootstrap_status NOT NULL DEFAULT 'NOT_STARTED',
  last_page_token text,
  total_items_fetched integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  last_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_v2_catalog_bootstrap_state ENABLE ROW LEVEL SECURITY;

-- Mirror the existing pricing_v2 admin-only access pattern
CREATE POLICY "Admins manage bootstrap state"
ON public.pricing_v2_catalog_bootstrap_state
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pricing_v2_bootstrap_state_updated_at
BEFORE UPDATE ON public.pricing_v2_catalog_bootstrap_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();