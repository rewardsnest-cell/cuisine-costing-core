-- =========================================================
-- Unified Leads: replace local_catering_contacts
-- =========================================================

-- 1. Create leads table (superset of catering contacts + standard CRM fields + event fields)
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Type / source
  lead_type TEXT NOT NULL DEFAULT 'other'
    CHECK (lead_type IN ('catering','contact_form','feedback','quote_request','referral','ad_hoc','other')),
  source TEXT,

  -- Person
  name TEXT,
  email TEXT,
  phone TEXT,

  -- Org
  company TEXT,
  organization_type TEXT,
  website TEXT,
  role_department TEXT,

  -- Location
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  distance_miles NUMERIC,

  -- Pipeline
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','follow-up','qualified','booked','repeat','won','lost','not-interested','archived')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high','medium','low')),
  assigned_to UUID,

  -- Outreach tracking
  first_outreach_date DATE,
  last_outreach_date DATE,
  next_follow_up_date DATE,
  last_contact_date DATE,
  last_channel TEXT CHECK (last_channel IS NULL OR last_channel IN ('call','email','walk-in','text','other')),

  -- Catering parity / event fields
  catering_use_cases TEXT[] NOT NULL DEFAULT '{}',
  event_date DATE,
  event_type TEXT,
  guest_count INTEGER,
  venue TEXT,
  est_budget NUMERIC,

  -- Free-form
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_priority ON public.leads(priority);
CREATE INDEX idx_leads_lead_type ON public.leads(lead_type);
CREATE INDEX idx_leads_email ON public.leads(lower(email));
CREATE INDEX idx_leads_next_follow_up ON public.leads(next_follow_up_date);
CREATE INDEX idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX idx_leads_use_cases ON public.leads USING GIN(catering_use_cases);
CREATE INDEX idx_leads_tags ON public.leads USING GIN(tags);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage leads"
ON public.leads FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Migrate existing catering data into leads
INSERT INTO public.leads (
  id, lead_type, source, name, email, phone,
  company, organization_type, website, role_department,
  address_street, address_city, address_state, address_zip, distance_miles,
  status, priority,
  first_outreach_date, last_outreach_date, next_follow_up_date, last_channel,
  catering_use_cases, notes, created_by, created_at, updated_at
)
SELECT
  id, 'catering', source, contact_name, email, phone,
  organization_name, organization_type, website, role_department,
  address_street, address_city, COALESCE(address_state, 'OH'), address_zip, distance_miles,
  CASE
    WHEN status = 'repeat' THEN 'repeat'
    ELSE status
  END,
  priority,
  first_outreach_date, last_outreach_date, next_follow_up_date, last_channel,
  COALESCE(catering_use_cases, '{}'), notes, created_by, created_at, updated_at
FROM public.local_catering_contacts;

-- 3. Drop old triggers / functions on catering tables before dropping
DROP TRIGGER IF EXISTS trg_log_local_catering_contact_changes ON public.local_catering_contacts;
DROP TRIGGER IF EXISTS update_local_catering_contacts_updated_at ON public.local_catering_contacts;
DROP TRIGGER IF EXISTS trg_log_local_catering_note_added ON public.local_catering_contact_notes;
DROP TRIGGER IF EXISTS update_local_catering_contact_notes_updated_at ON public.local_catering_contact_notes;
DROP TRIGGER IF EXISTS trg_bump_local_catering_last_outreach ON public.local_catering_outreach_log;
DROP TRIGGER IF EXISTS update_local_catering_outreach_log_updated_at ON public.local_catering_outreach_log;

-- 4. Rename existing child tables to point at leads, then re-add FK to leads
ALTER TABLE public.local_catering_contact_notes RENAME TO lead_notes;
ALTER TABLE public.lead_notes RENAME COLUMN contact_id TO lead_id;
ALTER TABLE public.lead_notes
  DROP CONSTRAINT IF EXISTS local_catering_contact_notes_contact_id_fkey;
ALTER TABLE public.lead_notes
  ADD CONSTRAINT lead_notes_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

ALTER TABLE public.local_catering_contact_activity RENAME TO lead_activity;
ALTER TABLE public.lead_activity RENAME COLUMN contact_id TO lead_id;
ALTER TABLE public.lead_activity
  DROP CONSTRAINT IF EXISTS local_catering_contact_activity_contact_id_fkey;
ALTER TABLE public.lead_activity
  ADD CONSTRAINT lead_activity_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

ALTER TABLE public.local_catering_outreach_log RENAME TO lead_outreach_log;
ALTER TABLE public.lead_outreach_log RENAME COLUMN contact_id TO lead_id;
ALTER TABLE public.lead_outreach_log
  DROP CONSTRAINT IF EXISTS local_catering_outreach_log_contact_id_fkey;
ALTER TABLE public.lead_outreach_log
  ADD CONSTRAINT lead_outreach_log_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Rename policies to clarity (drop & recreate)
DROP POLICY IF EXISTS "Admins manage local catering notes" ON public.lead_notes;
CREATE POLICY "Admins manage lead notes" ON public.lead_notes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins read local catering activity" ON public.lead_activity;
DROP POLICY IF EXISTS "Admins insert local catering activity" ON public.lead_activity;
CREATE POLICY "Admins read lead activity" ON public.lead_activity
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert lead activity" ON public.lead_activity
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage local catering outreach log" ON public.lead_outreach_log;
CREATE POLICY "Admins manage lead outreach log" ON public.lead_outreach_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Recreate triggers/functions targeting leads
CREATE OR REPLACE FUNCTION public.log_lead_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor UUID := auth.uid();
  tracked_fields TEXT[] := ARRAY[
    'status','priority','assigned_to','lead_type',
    'next_follow_up_date','last_outreach_date','first_outreach_date','last_contact_date','last_channel',
    'name','email','phone','company','organization_type','website','role_department',
    'address_street','address_city','address_state','address_zip','distance_miles',
    'event_date','event_type','guest_count','venue','est_budget','source'
  ];
  f TEXT; old_v TEXT; new_v TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_activity (lead_id, action, summary, actor_user_id)
    VALUES (NEW.id, 'created', 'Lead created: ' || COALESCE(NEW.company, NEW.name, NEW.email, NEW.id::text), actor);
    RETURN NEW;
  END IF;

  FOREACH f IN ARRAY tracked_fields LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f) INTO old_v, new_v USING OLD, NEW;
    IF old_v IS DISTINCT FROM new_v THEN
      INSERT INTO public.lead_activity (lead_id, action, field_name, old_value, new_value, actor_user_id)
      VALUES (NEW.id, 'field_change', f, old_v, new_v, actor);
    END IF;
  END LOOP;

  IF COALESCE(OLD.catering_use_cases, '{}') IS DISTINCT FROM COALESCE(NEW.catering_use_cases, '{}') THEN
    INSERT INTO public.lead_activity (lead_id, action, field_name, old_value, new_value, actor_user_id)
    VALUES (NEW.id, 'field_change', 'catering_use_cases',
      array_to_string(COALESCE(OLD.catering_use_cases, '{}'), ', '),
      array_to_string(COALESCE(NEW.catering_use_cases, '{}'), ', '), actor);
  END IF;

  IF COALESCE(OLD.tags, '{}') IS DISTINCT FROM COALESCE(NEW.tags, '{}') THEN
    INSERT INTO public.lead_activity (lead_id, action, field_name, old_value, new_value, actor_user_id)
    VALUES (NEW.id, 'field_change', 'tags',
      array_to_string(COALESCE(OLD.tags, '{}'), ', '),
      array_to_string(COALESCE(NEW.tags, '{}'), ', '), actor);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_lead_changes
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_lead_changes();

CREATE OR REPLACE FUNCTION public.log_lead_note_added()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.lead_activity (lead_id, action, summary, actor_user_id, metadata)
  VALUES (
    NEW.lead_id, 'note_added',
    'Note added' || CASE WHEN NEW.pinned THEN ' (pinned)' ELSE '' END,
    NEW.created_by,
    jsonb_build_object('note_id', NEW.id, 'pinned', NEW.pinned)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_lead_note_added
AFTER INSERT ON public.lead_notes
FOR EACH ROW EXECUTE FUNCTION public.log_lead_note_added();

CREATE TRIGGER update_lead_notes_updated_at
BEFORE UPDATE ON public.lead_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lead_outreach_log_updated_at
BEFORE UPDATE ON public.lead_outreach_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bump last_outreach on lead when outreach logged
CREATE OR REPLACE FUNCTION public.bump_lead_last_outreach()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('sent','queued') THEN
    UPDATE public.leads
       SET last_outreach_date = GREATEST(COALESCE(last_outreach_date, NEW.sent_at::date), NEW.sent_at::date),
           first_outreach_date = COALESCE(first_outreach_date, NEW.sent_at::date),
           last_channel = NEW.channel,
           updated_at = now()
     WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_lead_last_outreach
AFTER INSERT ON public.lead_outreach_log
FOR EACH ROW EXECUTE FUNCTION public.bump_lead_last_outreach();

-- Drop old functions
DROP FUNCTION IF EXISTS public.log_local_catering_contact_changes() CASCADE;
DROP FUNCTION IF EXISTS public.log_local_catering_note_added() CASCADE;
DROP FUNCTION IF EXISTS public.bump_local_catering_last_outreach() CASCADE;

-- 6. Drop old catering contacts table (data already migrated to leads)
DROP TABLE public.local_catering_contacts;

-- 7. Add lead_id to email_send_log so any sent email can be linked to a lead
ALTER TABLE public.email_send_log
  ADD COLUMN lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX idx_email_send_log_lead_id ON public.email_send_log(lead_id);

-- Allow admins to read & update the link on email_send_log (service role already has full)
CREATE POLICY "Admins read email send log" ON public.email_send_log
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update email send log" ON public.email_send_log
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));