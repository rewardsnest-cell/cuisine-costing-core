-- Affiliate programs YOU joined (you earn commissions from)
CREATE TABLE public.affiliate_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  network TEXT,
  affiliate_id TEXT,
  referral_link TEXT,
  commission_rate NUMERIC,
  commission_type TEXT NOT NULL DEFAULT 'percent',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.affiliate_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.affiliate_programs(id) ON DELETE CASCADE,
  earned_on DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_on DATE,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sponsorship / brand deals (companies pay YOU)
CREATE TABLE public.sponsorship_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  deal_type TEXT,
  deal_value NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pitched',
  pitched_on DATE DEFAULT CURRENT_DATE,
  signed_on DATE,
  delivered_on DATE,
  invoiced_on DATE,
  paid_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsorship_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage affiliate programs" ON public.affiliate_programs
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage affiliate earnings" ON public.affiliate_earnings
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage sponsorship deals" ON public.sponsorship_deals
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_affiliate_programs_updated BEFORE UPDATE ON public.affiliate_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sponsorship_deals_updated BEFORE UPDATE ON public.sponsorship_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_affiliate_earnings_program ON public.affiliate_earnings(program_id, earned_on DESC);
CREATE INDEX idx_sponsorship_deals_status ON public.sponsorship_deals(status, pitched_on DESC);