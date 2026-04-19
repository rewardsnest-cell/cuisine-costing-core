
-- Capture every recipe-page email opt-in
CREATE TABLE public.recipe_email_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  lead_magnet text NOT NULL DEFAULT 'printable',
  source text NOT NULL DEFAULT 'recipe_page',
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_email_signups_email ON public.recipe_email_signups (lower(email));
CREATE INDEX idx_recipe_email_signups_recipe ON public.recipe_email_signups (recipe_id);

ALTER TABLE public.recipe_email_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can sign up for recipe lead magnets"
  ON public.recipe_email_signups FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins read recipe email signups"
  ON public.recipe_email_signups FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4-step drip queue (Day 0/2/4/7)
CREATE TABLE public.recipe_drip_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signup_id uuid NOT NULL REFERENCES public.recipe_email_signups(id) ON DELETE CASCADE,
  email text NOT NULL,
  recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  step smallint NOT NULL CHECK (step BETWEEN 1 AND 4),
  template_name text NOT NULL,
  send_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  attempts smallint NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_drip_jobs_due
  ON public.recipe_drip_jobs (send_after)
  WHERE status = 'pending';
CREATE UNIQUE INDEX idx_recipe_drip_jobs_unique_step
  ON public.recipe_drip_jobs (signup_id, step);

ALTER TABLE public.recipe_drip_jobs ENABLE ROW LEVEL SECURITY;

-- Service role only (no user-facing policies). Admins can read for visibility.
CREATE POLICY "Admins read drip jobs"
  ON public.recipe_drip_jobs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
