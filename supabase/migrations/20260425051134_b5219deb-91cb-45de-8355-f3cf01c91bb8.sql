
-- Outreach tasks table
CREATE TABLE public.outreach_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','snoozed','skipped')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  suggested_channel TEXT,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  snoozed_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outreach_tasks_status_due ON public.outreach_tasks(status, due_date);
CREATE INDEX idx_outreach_tasks_lead ON public.outreach_tasks(lead_id);
CREATE UNIQUE INDEX idx_outreach_tasks_open_per_lead
  ON public.outreach_tasks(lead_id) WHERE status = 'pending';

ALTER TABLE public.outreach_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage outreach tasks"
  ON public.outreach_tasks FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_outreach_tasks_updated_at
  BEFORE UPDATE ON public.outreach_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Generate tasks from leads with due follow-ups
CREATE OR REPLACE FUNCTION public.generate_outreach_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  WITH inserted AS (
    INSERT INTO public.outreach_tasks (lead_id, due_date, priority, suggested_channel)
    SELECT
      l.id,
      COALESCE(l.next_follow_up_date, CURRENT_DATE),
      COALESCE(l.priority, 'medium'),
      COALESCE(l.last_channel, 'email')
    FROM public.leads l
    WHERE COALESCE(l.next_follow_up_date, CURRENT_DATE) <= CURRENT_DATE
      AND COALESCE(l.status, 'new') NOT IN ('booked','won','lost','not_interested','unsubscribed')
      AND NOT EXISTS (
        SELECT 1 FROM public.outreach_tasks t
        WHERE t.lead_id = l.id AND t.status = 'pending'
      )
    RETURNING 1
  )
  SELECT count(*)::int INTO v_inserted FROM inserted;
  RETURN COALESCE(v_inserted, 0);
END;
$$;

-- Log a contact attempt against a lead
CREATE OR REPLACE FUNCTION public.log_lead_contact(
  p_lead_id UUID,
  p_channel TEXT,           -- 'call' | 'email' | 'walk_in' | 'sms'
  p_outcome TEXT,           -- 'connected' | 'no_answer' | 'left_message' | 'not_interested' | 'booked' | 'follow_up'
  p_notes TEXT DEFAULT NULL,
  p_task_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_activity_id UUID;
  v_today DATE := CURRENT_DATE;
  v_next_status TEXT;
  v_next_followup DATE;
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_channel NOT IN ('call','email','walk_in','sms') THEN
    RAISE EXCEPTION 'invalid channel: %', p_channel;
  END IF;

  -- Compute next status + follow-up date based on outcome
  v_next_status := CASE p_outcome
    WHEN 'booked' THEN 'booked'
    WHEN 'not_interested' THEN 'not_interested'
    WHEN 'connected' THEN 'engaged'
    WHEN 'left_message' THEN 'contacted'
    WHEN 'no_answer' THEN 'contacted'
    WHEN 'follow_up' THEN 'follow_up'
    ELSE 'contacted'
  END;

  v_next_followup := CASE p_outcome
    WHEN 'booked' THEN NULL
    WHEN 'not_interested' THEN NULL
    WHEN 'connected' THEN v_today + 7
    WHEN 'follow_up' THEN v_today + 3
    WHEN 'left_message' THEN v_today + 2
    WHEN 'no_answer' THEN v_today + 1
    ELSE v_today + 5
  END;

  -- Insert activity record
  INSERT INTO public.lead_activity (lead_id, action, actor_user_id, summary, metadata)
  VALUES (
    p_lead_id,
    'contact_logged',
    v_actor,
    format('%s — %s%s', p_channel, p_outcome, COALESCE(': ' || p_notes, '')),
    jsonb_build_object('channel', p_channel, 'outcome', p_outcome, 'notes', p_notes)
  )
  RETURNING id INTO v_activity_id;

  -- Update lead
  UPDATE public.leads
  SET
    status = v_next_status,
    last_channel = p_channel,
    last_outreach_date = v_today,
    last_contact_date = v_today,
    first_outreach_date = COALESCE(first_outreach_date, v_today),
    next_follow_up_date = v_next_followup,
    updated_at = now()
  WHERE id = p_lead_id;

  -- Mark task done if provided
  IF p_task_id IS NOT NULL THEN
    UPDATE public.outreach_tasks
    SET status = 'done',
        completed_at = now(),
        completed_by = v_actor,
        notes = COALESCE(notes || E'\n', '') || COALESCE(p_notes, '')
    WHERE id = p_task_id;
  END IF;

  RETURN v_activity_id;
END;
$$;

-- Snooze helper
CREATE OR REPLACE FUNCTION public.snooze_outreach_task(p_task_id UUID, p_days INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lead UUID; v_until DATE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_until := CURRENT_DATE + p_days;
  UPDATE public.outreach_tasks
  SET status = 'snoozed', snoozed_until = v_until
  WHERE id = p_task_id
  RETURNING lead_id INTO v_lead;
  UPDATE public.leads SET next_follow_up_date = v_until WHERE id = v_lead;
END;
$$;
