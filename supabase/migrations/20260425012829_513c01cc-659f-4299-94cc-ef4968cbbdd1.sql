CREATE TABLE public.user_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  kind text NOT NULL,
  filename text NOT NULL,
  storage_path text,
  public_url text,
  mime_type text,
  size_bytes integer,
  source_id text,
  source_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_downloads_user_id ON public.user_downloads(user_id);
CREATE INDEX idx_user_downloads_kind ON public.user_downloads(kind);
CREATE INDEX idx_user_downloads_created_at ON public.user_downloads(created_at DESC);

ALTER TABLE public.user_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own downloads"
  ON public.user_downloads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own downloads"
  ON public.user_downloads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own downloads"
  ON public.user_downloads FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all downloads"
  ON public.user_downloads FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled)
VALUES
  ('my_downloads', 'public', true),
  ('admin_downloads', 'public', true)
ON CONFLICT (feature_key) DO NOTHING;