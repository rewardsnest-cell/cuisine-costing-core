CREATE TABLE IF NOT EXISTS public.pe_match_settings (
  id integer PRIMARY KEY DEFAULT 1,
  link_threshold numeric NOT NULL DEFAULT 0.70,
  auto_merge_threshold numeric NOT NULL DEFAULT 0.85,
  ignore_tokens text[] NOT NULL DEFAULT ARRAY['fresh','raw','whole','large','small','medium','organic','the','a','an','chopped','minced','diced','sliced','grated','ground']::text[],
  require_unit_match boolean NOT NULL DEFAULT true,
  use_ai_default boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pe_match_settings_singleton CHECK (id = 1),
  CONSTRAINT pe_match_settings_thresholds CHECK (
    link_threshold >= 0 AND link_threshold <= 1
    AND auto_merge_threshold >= 0 AND auto_merge_threshold <= 1
    AND auto_merge_threshold >= link_threshold
  )
);

INSERT INTO public.pe_match_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pe_match_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pe match settings"
  ON public.pe_match_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can update pe match settings"
  ON public.pe_match_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_pe_match_settings_updated_at
  BEFORE UPDATE ON public.pe_match_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();