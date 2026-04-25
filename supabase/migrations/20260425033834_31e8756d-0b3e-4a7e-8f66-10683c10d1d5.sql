
CREATE OR REPLACE FUNCTION public.queue_prospect_followups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status = 'Contacted' AND OLD.status IS DISTINCT FROM 'Contacted')
     OR (TG_OP = 'INSERT' AND NEW.status = 'Contacted') THEN
    INSERT INTO public.sales_followup_queue (prospect_id, step, scheduled_for)
      VALUES (NEW.id, 'day5', (CURRENT_DATE + INTERVAL '5 days')::date)
      ON CONFLICT (prospect_id, step) DO UPDATE
        SET scheduled_for = EXCLUDED.scheduled_for, status = 'pending', sent_at = NULL, error = NULL;
    INSERT INTO public.sales_followup_queue (prospect_id, step, scheduled_for)
      VALUES (NEW.id, 'day14', (CURRENT_DATE + INTERVAL '14 days')::date)
      ON CONFLICT (prospect_id, step) DO UPDATE
        SET scheduled_for = EXCLUDED.scheduled_for, status = 'pending', sent_at = NULL, error = NULL;
    NEW.next_follow_up := (CURRENT_DATE + INTERVAL '5 days')::date;
    NEW.last_outreach_date := CURRENT_DATE;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('Booked','Repeat') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.sales_followup_queue
       SET status = 'skipped'
     WHERE prospect_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_prospect_followups ON public.sales_prospects;
CREATE TRIGGER trg_queue_prospect_followups
BEFORE INSERT OR UPDATE ON public.sales_prospects
FOR EACH ROW EXECUTE FUNCTION public.queue_prospect_followups();
