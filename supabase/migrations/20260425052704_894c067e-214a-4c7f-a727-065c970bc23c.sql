-- Verification fields on leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_issues text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_verification_status_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_verification_status_check
  CHECK (verification_status IN ('verified','needs_review','unverified'));

CREATE INDEX IF NOT EXISTS idx_leads_verification_status ON public.leads(verification_status);

-- Compute verification automatically
CREATE OR REPLACE FUNCTION public.compute_lead_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  issues text[] := '{}';
  has_email boolean;
  has_phone boolean;
  email_valid boolean := true;
  phone_digits text;
BEGIN
  has_email := NEW.email IS NOT NULL AND length(btrim(NEW.email)) > 0;
  has_phone := NEW.phone IS NOT NULL AND length(btrim(NEW.phone)) > 0;

  IF NOT has_email AND NOT has_phone THEN
    issues := array_append(issues, 'missing_email_and_phone');
  ELSE
    IF NOT has_email THEN
      issues := array_append(issues, 'missing_email');
    END IF;
    IF NOT has_phone THEN
      issues := array_append(issues, 'missing_phone');
    END IF;
  END IF;

  IF has_email THEN
    email_valid := NEW.email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
    IF NOT email_valid THEN
      issues := array_append(issues, 'invalid_email');
    END IF;
  END IF;

  IF has_phone THEN
    phone_digits := regexp_replace(NEW.phone, '\D', '', 'g');
    IF length(phone_digits) < 10 THEN
      issues := array_append(issues, 'invalid_phone');
    END IF;
  END IF;

  IF NEW.name IS NULL OR length(btrim(NEW.name)) = 0 THEN
    IF NEW.company IS NULL OR length(btrim(NEW.company)) = 0 THEN
      issues := array_append(issues, 'missing_name_and_company');
    END IF;
  END IF;

  NEW.verification_issues := issues;

  -- Preserve manual 'verified' only if no auto-detected blocking issues
  IF array_length(issues, 1) IS NULL THEN
    IF NEW.verification_status = 'needs_review' OR NEW.verification_status = 'unverified' THEN
      NEW.verification_status := 'verified';
      IF NEW.verified_at IS NULL THEN
        NEW.verified_at := now();
      END IF;
    END IF;
  ELSE
    NEW.verification_status := 'needs_review';
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_lead_verification ON public.leads;
CREATE TRIGGER trg_compute_lead_verification
BEFORE INSERT OR UPDATE OF email, phone, name, company ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.compute_lead_verification();

-- Backfill existing rows
UPDATE public.leads SET email = email;

-- Block scheduling outreach (next_follow_up_date) on flagged leads
CREATE OR REPLACE FUNCTION public.guard_outreach_scheduling()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.next_follow_up_date IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.next_follow_up_date IS DISTINCT FROM OLD.next_follow_up_date)
     AND NEW.verification_status = 'needs_review' THEN
    RAISE EXCEPTION 'Cannot schedule outreach for lead %: contact requires manual verification (%).',
      NEW.id, array_to_string(NEW.verification_issues, ', ');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_outreach_scheduling ON public.leads;
CREATE TRIGGER trg_guard_outreach_scheduling
BEFORE INSERT OR UPDATE OF next_follow_up_date ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.guard_outreach_scheduling();

-- Same guard on outreach_tasks
CREATE OR REPLACE FUNCTION public.guard_outreach_task_scheduling()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_issues text[];
BEGIN
  SELECT verification_status, verification_issues
    INTO v_status, v_issues
  FROM public.leads WHERE id = NEW.lead_id;

  IF v_status = 'needs_review' THEN
    RAISE EXCEPTION 'Cannot create outreach task for lead %: contact requires manual verification (%).',
      NEW.lead_id, array_to_string(v_issues, ', ');
  END IF;
  RETURN NEW;
END;
$$;

-- Only attach if outreach_tasks exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='outreach_tasks') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_guard_outreach_task_scheduling ON public.outreach_tasks';
    EXECUTE 'CREATE TRIGGER trg_guard_outreach_task_scheduling BEFORE INSERT OR UPDATE OF lead_id ON public.outreach_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_outreach_task_scheduling()';
  END IF;
END $$;