-- Sales Hub tables

CREATE TABLE public.sales_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  city text NOT NULL,
  type text NOT NULL,
  contact_name text,
  phone text,
  email text,
  notes text,
  status text NOT NULL DEFAULT 'new',
  last_contacted timestamptz,
  next_follow_up date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sales_prospects" ON public.sales_prospects
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_sales_prospects_updated
  BEFORE UPDATE ON public.sales_prospects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sales_contact_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid REFERENCES public.sales_prospects(id) ON DELETE CASCADE,
  channel text NOT NULL,
  outcome text,
  notes text,
  contacted_at timestamptz NOT NULL DEFAULT now(),
  contacted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_contact_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sales_contact_log" ON public.sales_contact_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_sales_contact_log_contacted_at ON public.sales_contact_log(contacted_at DESC);

CREATE TABLE public.sales_daily_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  calls_done boolean NOT NULL DEFAULT false,
  emails_done boolean NOT NULL DEFAULT false,
  walkins_done boolean NOT NULL DEFAULT false,
  leads_logged boolean NOT NULL DEFAULT false,
  followups_scheduled boolean NOT NULL DEFAULT false,
  opportunity_moved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day)
);
ALTER TABLE public.sales_daily_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sales_daily_checklist" ON public.sales_daily_checklist
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_sales_daily_checklist_updated
  BEFORE UPDATE ON public.sales_daily_checklist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sales_event_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL UNIQUE,
  pre_menu boolean NOT NULL DEFAULT false,
  pre_dietary boolean NOT NULL DEFAULT false,
  pre_staffing boolean NOT NULL DEFAULT false,
  pre_equipment boolean NOT NULL DEFAULT false,
  day_arrival boolean NOT NULL DEFAULT false,
  day_setup boolean NOT NULL DEFAULT false,
  day_checkin boolean NOT NULL DEFAULT false,
  day_breakdown boolean NOT NULL DEFAULT false,
  post_thanks boolean NOT NULL DEFAULT false,
  post_invoice boolean NOT NULL DEFAULT false,
  post_review boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_event_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sales_event_checklist" ON public.sales_event_checklist
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_sales_event_checklist_updated
  BEFORE UPDATE ON public.sales_event_checklist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sales_review_asks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  channel text NOT NULL,
  asked_at timestamptz NOT NULL DEFAULT now(),
  asked_by uuid,
  review_received boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_review_asks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sales_review_asks" ON public.sales_review_asks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.sales_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_name text NOT NULL,
  referred_name text,
  referred_contact text,
  asked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sales_referrals" ON public.sales_referrals
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_sales_referrals_updated
  BEFORE UPDATE ON public.sales_referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sales_weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  user_id uuid,
  bookings_added integer NOT NULL DEFAULT 0,
  reviews_gained integer NOT NULL DEFAULT 0,
  best_review_text text,
  improvement_note text,
  next_week_plan text,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, user_id)
);
ALTER TABLE public.sales_weekly_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sales_weekly_reviews" ON public.sales_weekly_reviews
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_sales_weekly_reviews_updated
  BEFORE UPDATE ON public.sales_weekly_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed feature visibility flags for the Sales Hub nav group + items
INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled, notes) VALUES
  ('admin_sales_hub',              'public', true, 'Sales Hub group + dashboard'),
  ('admin_sales_prospects',        'public', true, 'Local prospect lists'),
  ('admin_sales_scripts',          'public', true, 'Locked sales scripts'),
  ('admin_sales_daily',            'public', true, 'Daily sales checklist'),
  ('admin_sales_events_checklist', 'public', true, 'Event execution checklist'),
  ('admin_sales_reviews',          'public', true, 'Google reviews system'),
  ('admin_sales_followups',        'public', true, 'Follow-up system'),
  ('admin_sales_referrals',        'public', true, 'Referral system'),
  ('admin_sales_weekly_review',    'public', true, 'Weekly review page')
ON CONFLICT (feature_key) DO UPDATE SET phase = EXCLUDED.phase, nav_enabled = EXCLUDED.nav_enabled;