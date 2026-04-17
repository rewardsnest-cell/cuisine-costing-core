-- 1. Add 'employee' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'employee';

-- 2. employee_profiles table
CREATE TABLE public.employee_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  position TEXT,
  phone TEXT,
  hourly_rate NUMERIC DEFAULT 0,
  hire_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all employee profiles"
ON public.employee_profiles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees view own profile"
ON public.employee_profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_employee_profiles_updated_at
BEFORE UPDATE ON public.employee_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3. event_assignments table (quote = event in this app)
CREATE TABLE public.event_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'Lead',
  notes TEXT,
  assigned_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (quote_id, employee_user_id, role)
);

CREATE INDEX idx_event_assignments_quote ON public.event_assignments(quote_id);
CREATE INDEX idx_event_assignments_employee ON public.event_assignments(employee_user_id);

ALTER TABLE public.event_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all assignments"
ON public.event_assignments FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees view own assignments"
ON public.event_assignments FOR SELECT
TO authenticated
USING (auth.uid() = employee_user_id);