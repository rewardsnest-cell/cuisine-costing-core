-- Feedback submissions from any visitor (anon or authenticated)
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  message text NOT NULL,
  page_url text,
  user_agent text,
  rating smallint,
  status text NOT NULL DEFAULT 'new',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can submit (length-guarded by app + sane DB checks)
CREATE POLICY "Anyone can submit feedback"
  ON public.feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(message) BETWEEN 1 AND 4000
    AND (email IS NULL OR char_length(email) <= 254)
    AND (page_url IS NULL OR char_length(page_url) <= 2048)
    AND (user_agent IS NULL OR char_length(user_agent) <= 1024)
  );

-- Authenticated users can see their own
CREATE POLICY "Users view own feedback"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Admins manage everything
CREATE POLICY "Admins manage feedback"
  ON public.feedback
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-bump updated_at
CREATE TRIGGER update_feedback_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_feedback_status_created ON public.feedback (status, created_at DESC);
CREATE INDEX idx_feedback_user_id ON public.feedback (user_id) WHERE user_id IS NOT NULL;