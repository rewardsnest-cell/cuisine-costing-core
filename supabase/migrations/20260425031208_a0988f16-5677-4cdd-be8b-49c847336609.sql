CREATE TABLE public.admin_daily_priorities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  done BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_daily_priorities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage daily priorities"
ON public.admin_daily_priorities FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_admin_daily_priorities_due ON public.admin_daily_priorities(due_date, position);

CREATE TRIGGER update_admin_daily_priorities_updated_at
BEFORE UPDATE ON public.admin_daily_priorities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.admin_weekly_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  target_value NUMERIC,
  progress_value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  done BOOLEAN NOT NULL DEFAULT false,
  week_start DATE NOT NULL DEFAULT date_trunc('week', CURRENT_DATE)::date,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_weekly_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage weekly goals"
ON public.admin_weekly_goals FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_admin_weekly_goals_week ON public.admin_weekly_goals(week_start, position);

CREATE TRIGGER update_admin_weekly_goals_updated_at
BEFORE UPDATE ON public.admin_weekly_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();