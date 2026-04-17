
-- 1. Recipe active flag
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 2. Helper: is the user assigned to a quote?
CREATE OR REPLACE FUNCTION public.is_assigned_to_quote(_user_id uuid, _quote_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_assignments
    WHERE quote_id = _quote_id AND employee_user_id = _user_id
  )
$$;

-- 3. event_prep_tasks
CREATE TABLE IF NOT EXISTS public.event_prep_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  quote_item_id uuid REFERENCES public.quote_items(id) ON DELETE CASCADE,
  title text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('auto','manual')),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prep_tasks_quote ON public.event_prep_tasks(quote_id);

ALTER TABLE public.event_prep_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all prep tasks"
  ON public.event_prep_tasks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Assigned employees view prep tasks"
  ON public.event_prep_tasks FOR SELECT TO authenticated
  USING (public.is_assigned_to_quote(auth.uid(), quote_id));

CREATE POLICY "Assigned employees update prep tasks"
  ON public.event_prep_tasks FOR UPDATE TO authenticated
  USING (public.is_assigned_to_quote(auth.uid(), quote_id))
  WITH CHECK (public.is_assigned_to_quote(auth.uid(), quote_id));

CREATE POLICY "Assigned employees insert prep tasks"
  ON public.event_prep_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_assigned_to_quote(auth.uid(), quote_id));

CREATE POLICY "Assigned employees delete own manual prep tasks"
  ON public.event_prep_tasks FOR DELETE TO authenticated
  USING (public.is_assigned_to_quote(auth.uid(), quote_id) AND source = 'manual');

CREATE TRIGGER trg_prep_tasks_updated
  BEFORE UPDATE ON public.event_prep_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Auto-create prep tasks from quote_items
CREATE OR REPLACE FUNCTION public.create_prep_task_for_quote_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.event_prep_tasks (quote_id, quote_item_id, title, source)
  VALUES (
    NEW.quote_id,
    NEW.id,
    'Prep: ' || NEW.name || ' x' || NEW.quantity::text,
    'auto'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_item_prep_task ON public.quote_items;
CREATE TRIGGER trg_quote_item_prep_task
  AFTER INSERT ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.create_prep_task_for_quote_item();

-- 5. event_time_entries
CREATE TABLE IF NOT EXISTS public.event_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL,
  clock_in_at timestamptz NOT NULL DEFAULT now(),
  clock_out_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_quote ON public.event_time_entries(quote_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON public.event_time_entries(employee_user_id);

ALTER TABLE public.event_time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all time entries"
  ON public.event_time_entries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees view own time entries"
  ON public.event_time_entries FOR SELECT TO authenticated
  USING (auth.uid() = employee_user_id);

CREATE POLICY "Employees insert own time entries"
  ON public.event_time_entries FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = employee_user_id
    AND public.is_assigned_to_quote(auth.uid(), quote_id)
  );

CREATE POLICY "Employees update own time entries"
  ON public.event_time_entries FOR UPDATE TO authenticated
  USING (auth.uid() = employee_user_id)
  WITH CHECK (auth.uid() = employee_user_id);

CREATE TRIGGER trg_time_entries_updated
  BEFORE UPDATE ON public.event_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
