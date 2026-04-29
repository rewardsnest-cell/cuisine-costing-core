CREATE TABLE public.user_nav_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nav_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, nav_key)
);

CREATE INDEX idx_user_nav_overrides_user_id ON public.user_nav_overrides(user_id);

ALTER TABLE public.user_nav_overrides ENABLE ROW LEVEL SECURITY;

-- Users can read their own rows (sidebar needs to fetch them).
CREATE POLICY "Users can read their own nav overrides"
  ON public.user_nav_overrides
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all rows.
CREATE POLICY "Admins can read all nav overrides"
  ON public.user_nav_overrides
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can create / update / delete.
CREATE POLICY "Admins can insert nav overrides"
  ON public.user_nav_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update nav overrides"
  ON public.user_nav_overrides
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete nav overrides"
  ON public.user_nav_overrides
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Reuse existing timestamp trigger function if it exists, else create.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_user_nav_overrides_updated_at
  BEFORE UPDATE ON public.user_nav_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();