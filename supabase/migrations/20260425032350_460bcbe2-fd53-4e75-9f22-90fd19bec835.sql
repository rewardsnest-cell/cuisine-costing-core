
-- Activity log for daily priorities and weekly goals
CREATE TABLE public.admin_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  entity_type text NOT NULL, -- 'priority' | 'goal'
  entity_id uuid,
  action text NOT NULL,      -- 'created' | 'updated' | 'deleted' | 'completed' | 'reopened'
  title text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  actor_email text
);

CREATE INDEX idx_admin_activity_log_created_at ON public.admin_activity_log (created_at DESC);
CREATE INDEX idx_admin_activity_log_entity ON public.admin_activity_log (entity_type, entity_id);

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin activity log"
  ON public.admin_activity_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert admin activity log"
  ON public.admin_activity_log FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Generic logger function
CREATE OR REPLACE FUNCTION public.log_admin_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_type text;
  v_action text;
  v_title text;
  v_changes jsonb := '{}'::jsonb;
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  IF TG_TABLE_NAME = 'admin_daily_priorities' THEN
    v_entity_type := 'priority';
  ELSIF TG_TABLE_NAME = 'admin_weekly_goals' THEN
    v_entity_type := 'goal';
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_actor;

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_title := NEW.title;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_title := OLD.title;
  ELSIF TG_OP = 'UPDATE' THEN
    v_title := NEW.title;
    IF NEW.done IS DISTINCT FROM OLD.done THEN
      v_action := CASE WHEN NEW.done THEN 'completed' ELSE 'reopened' END;
    ELSE
      v_action := 'updated';
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('from', OLD.title, 'to', NEW.title));
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      v_changes := v_changes || jsonb_build_object('notes', jsonb_build_object('from', OLD.notes, 'to', NEW.notes));
    END IF;
    IF NEW.done IS DISTINCT FROM OLD.done THEN
      v_changes := v_changes || jsonb_build_object('done', jsonb_build_object('from', OLD.done, 'to', NEW.done));
    END IF;
    IF v_entity_type = 'goal' THEN
      IF NEW.progress_value IS DISTINCT FROM OLD.progress_value THEN
        v_changes := v_changes || jsonb_build_object('progress_value', jsonb_build_object('from', OLD.progress_value, 'to', NEW.progress_value));
      END IF;
      IF NEW.target_value IS DISTINCT FROM OLD.target_value THEN
        v_changes := v_changes || jsonb_build_object('target_value', jsonb_build_object('from', OLD.target_value, 'to', NEW.target_value));
      END IF;
    END IF;
    -- Skip pure position updates with no other changes
    IF v_action = 'updated' AND v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.admin_activity_log (entity_type, entity_id, action, title, changes, actor_user_id, actor_email)
  VALUES (
    v_entity_type,
    COALESCE(NEW.id, OLD.id),
    v_action,
    v_title,
    v_changes,
    v_actor,
    v_email
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_log_admin_daily_priorities
AFTER INSERT OR UPDATE OR DELETE ON public.admin_daily_priorities
FOR EACH ROW EXECUTE FUNCTION public.log_admin_activity();

CREATE TRIGGER trg_log_admin_weekly_goals
AFTER INSERT OR UPDATE OR DELETE ON public.admin_weekly_goals
FOR EACH ROW EXECUTE FUNCTION public.log_admin_activity();
