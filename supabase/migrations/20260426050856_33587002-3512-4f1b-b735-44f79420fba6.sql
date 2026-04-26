CREATE TABLE IF NOT EXISTS public.pricing_v2_schedule_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.pricing_v2_keyword_schedules(id) ON DELETE CASCADE,
  schedule_name text,
  event_type text NOT NULL CHECK (event_type IN ('run_success','run_error','auto_disabled')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','success')),
  title text NOT NULL,
  message text,
  run_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pv2_sched_notif_created_idx
  ON public.pricing_v2_schedule_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS pv2_sched_notif_unread_idx
  ON public.pricing_v2_schedule_notifications (read_at) WHERE read_at IS NULL;

ALTER TABLE public.pricing_v2_schedule_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view schedule notifications"
  ON public.pricing_v2_schedule_notifications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update schedule notifications"
  ON public.pricing_v2_schedule_notifications
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete schedule notifications"
  ON public.pricing_v2_schedule_notifications
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));