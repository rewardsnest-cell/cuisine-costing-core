-- Admin access requests table
CREATE TABLE public.admin_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;

-- Users can create their own request
CREATE POLICY "Users can create own admin request"
ON public.admin_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view their own request
CREATE POLICY "Users can view own admin request"
ON public.admin_requests FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Admins can view, update, delete all requests
CREATE POLICY "Admins can view all admin requests"
ON public.admin_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update admin requests"
ON public.admin_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete admin requests"
ON public.admin_requests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_admin_requests_updated_at
BEFORE UPDATE ON public.admin_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();