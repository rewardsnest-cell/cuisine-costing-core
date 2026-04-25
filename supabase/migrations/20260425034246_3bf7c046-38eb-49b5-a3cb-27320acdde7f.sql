-- =========================================================
-- 1. CRM Notes
-- =========================================================
CREATE TABLE public.local_catering_contact_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.local_catering_contacts(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_lcc_notes_contact ON public.local_catering_contact_notes(contact_id, created_at DESC);
CREATE INDEX idx_lcc_notes_pinned ON public.local_catering_contact_notes(contact_id) WHERE pinned;

ALTER TABLE public.local_catering_contact_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage local catering notes"
ON public.local_catering_contact_notes
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_local_catering_contact_notes_updated_at
BEFORE UPDATE ON public.local_catering_contact_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2. Activity log (field-change audit + custom events)
-- =========================================================
CREATE TABLE public.local_catering_contact_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.local_catering_contacts(id) ON DELETE CASCADE,

  -- 'field_change' | 'created' | 'note_added' | 'email_sent' | 'call' | 'walk_in' | 'custom'
  action TEXT NOT NULL DEFAULT 'field_change',
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  actor_user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_lcc_activity_contact ON public.local_catering_contact_activity(contact_id, created_at DESC);
CREATE INDEX idx_lcc_activity_action ON public.local_catering_contact_activity(action);

ALTER TABLE public.local_catering_contact_activity ENABLE ROW LEVEL SECURITY;

-- Admins can read everything
CREATE POLICY "Admins read local catering activity"
ON public.local_catering_contact_activity
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert custom events manually
CREATE POLICY "Admins insert local catering activity"
ON public.local_catering_contact_activity
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- No UPDATE / DELETE policies = audit log is append-only

-- =========================================================
-- 3. Auto-log field changes on local_catering_contacts
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_local_catering_contact_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  tracked_fields TEXT[] := ARRAY[
    'status','priority','next_follow_up_date','last_outreach_date','first_outreach_date',
    'last_channel','organization_name','contact_name','role_department','email','phone',
    'website','organization_type','address_street','address_city','address_state',
    'address_zip','distance_miles','source'
  ];
  f TEXT;
  old_v TEXT;
  new_v TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.local_catering_contact_activity (contact_id, action, summary, actor_user_id)
    VALUES (NEW.id, 'created', 'Contact created: ' || NEW.organization_name, actor);
    RETURN NEW;
  END IF;

  -- UPDATE: log every tracked field that changed
  FOREACH f IN ARRAY tracked_fields LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f)
      INTO old_v, new_v
      USING OLD, NEW;

    IF old_v IS DISTINCT FROM new_v THEN
      INSERT INTO public.local_catering_contact_activity
        (contact_id, action, field_name, old_value, new_value, actor_user_id)
      VALUES (NEW.id, 'field_change', f, old_v, new_v, actor);
    END IF;
  END LOOP;

  -- catering_use_cases is an array — compare separately
  IF COALESCE(OLD.catering_use_cases, '{}') IS DISTINCT FROM COALESCE(NEW.catering_use_cases, '{}') THEN
    INSERT INTO public.local_catering_contact_activity
      (contact_id, action, field_name, old_value, new_value, actor_user_id)
    VALUES (
      NEW.id, 'field_change', 'catering_use_cases',
      array_to_string(COALESCE(OLD.catering_use_cases, '{}'), ', '),
      array_to_string(COALESCE(NEW.catering_use_cases, '{}'), ', '),
      actor
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_local_catering_contact_changes
AFTER INSERT OR UPDATE ON public.local_catering_contacts
FOR EACH ROW
EXECUTE FUNCTION public.log_local_catering_contact_changes();

-- =========================================================
-- 4. Auto-log when a note is added
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_local_catering_note_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.local_catering_contact_activity
    (contact_id, action, summary, actor_user_id, metadata)
  VALUES (
    NEW.contact_id,
    'note_added',
    'Note added' || CASE WHEN NEW.pinned THEN ' (pinned)' ELSE '' END,
    auth.uid(),
    jsonb_build_object('note_id', NEW.id, 'preview', left(NEW.body, 140))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_local_catering_note_added
AFTER INSERT ON public.local_catering_contact_notes
FOR EACH ROW
EXECUTE FUNCTION public.log_local_catering_note_added();