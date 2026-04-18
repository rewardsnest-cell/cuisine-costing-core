CREATE TABLE public.newsletter_subscribers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'follow_page',
  unsubscribed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe"
ON public.newsletter_subscribers
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins manage subscribers"
ON public.newsletter_subscribers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_newsletter_subscribers_updated_at
BEFORE UPDATE ON public.newsletter_subscribers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_newsletter_subscribers_email ON public.newsletter_subscribers(email);