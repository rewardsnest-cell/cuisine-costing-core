
-- Enums (skip lead_status — existing leads.status is text and may have data later)
CREATE TYPE public.lead_priority AS ENUM ('HOT', 'WARM', 'COLD');
CREATE TYPE public.lead_source_type AS ENUM ('website', 'show', 'referral', 'outbound');
CREATE TYPE public.show_event_type AS ENUM ('Wedding', 'Corporate', 'Catering', 'Social');
CREATE TYPE public.lead_interaction_type AS ENUM ('call', 'text', 'email', 'meeting', 'note');

-- Show events
CREATE TABLE public.show_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_type public.show_event_type NOT NULL,
  event_date date,
  location text,
  booth_size text,
  primary_goal text,
  kiosk_active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Extend existing leads
ALTER TABLE public.leads
  ADD COLUMN first_name text,
  ADD COLUMN last_name text,
  ADD COLUMN source_type public.lead_source_type,
  ADD COLUMN source_event_id uuid REFERENCES public.show_events(id) ON DELETE SET NULL,
  ADD COLUMN priority_level public.lead_priority NOT NULL DEFAULT 'WARM',
  ADD COLUMN guest_count_band text,
  ADD COLUMN venue_selected boolean,
  ADD COLUMN consent_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN last_contacted_at timestamptz;

CREATE INDEX idx_leads_priority_level ON public.leads(priority_level);
CREATE INDEX idx_leads_source_type ON public.leads(source_type);
CREATE INDEX idx_leads_source_event ON public.leads(source_event_id);

-- Interactions
CREATE TABLE public.lead_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type public.lead_interaction_type NOT NULL,
  outcome text,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_interactions_lead ON public.lead_interactions(lead_id, occurred_at DESC);

-- Prizes
CREATE TABLE public.show_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_name text NOT NULL,
  description text,
  weight integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One spin per lead
CREATE TABLE public.lead_prize_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  prize_id uuid REFERENCES public.show_prizes(id) ON DELETE SET NULL,
  prize_name_snapshot text NOT NULL,
  spun_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger fn (idempotent)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_show_events_updated BEFORE UPDATE ON public.show_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable RLS on new tables
ALTER TABLE public.show_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_prize_spins ENABLE ROW LEVEL SECURITY;

-- show_events policies
CREATE POLICY "show_events admin/sales/social manage" ON public.show_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'social_media'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'social_media'));
CREATE POLICY "show_events authed read" ON public.show_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "show_events anon read kiosk active" ON public.show_events FOR SELECT TO anon USING (kiosk_active = true);

-- Add anon kiosk insert policy on existing leads table
CREATE POLICY "leads anon kiosk insert" ON public.leads FOR INSERT TO anon
  WITH CHECK (
    consent_contact = true
    AND source_type = 'show'
    AND source_event_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.show_events e WHERE e.id = source_event_id AND e.kiosk_active = true)
  );

-- lead_interactions policies
CREATE POLICY "lead_interactions admin/sales all" ON public.lead_interactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));
CREATE POLICY "lead_interactions assigned read" ON public.lead_interactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.assigned_to = auth.uid()));

-- show_prizes policies
CREATE POLICY "show_prizes admin/sales manage" ON public.show_prizes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));
CREATE POLICY "show_prizes authed read" ON public.show_prizes FOR SELECT TO authenticated USING (true);
CREATE POLICY "show_prizes anon read active" ON public.show_prizes FOR SELECT TO anon USING (active = true);

-- lead_prize_spins policies
CREATE POLICY "lead_prize_spins admin/sales all" ON public.lead_prize_spins FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales'));
CREATE POLICY "lead_prize_spins anon insert" ON public.lead_prize_spins FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.show_events e ON e.id = l.source_event_id
      WHERE l.id = lead_id AND e.kiosk_active = true AND l.created_at > now() - interval '10 minutes'
    )
  );
