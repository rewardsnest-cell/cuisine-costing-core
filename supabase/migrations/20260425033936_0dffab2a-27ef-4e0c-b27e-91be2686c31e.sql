-- Create Local Catering Contacts table
CREATE TABLE public.local_catering_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Organization
  organization_name TEXT NOT NULL,
  organization_type TEXT,
  website TEXT,

  -- Contact person
  contact_name TEXT,
  role_department TEXT,
  email TEXT,
  phone TEXT,

  -- Location
  address_street TEXT,
  address_city TEXT,
  address_state TEXT DEFAULT 'OH',
  address_zip TEXT,
  distance_miles NUMERIC,

  -- Pipeline
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','follow-up','booked','repeat','not-interested')),

  -- Use cases (e.g. ['weddings','corporate_lunch','fundraiser'])
  catering_use_cases TEXT[] NOT NULL DEFAULT '{}',

  -- Outreach tracking
  first_outreach_date DATE,
  last_outreach_date DATE,
  next_follow_up_date DATE,
  last_channel TEXT CHECK (last_channel IS NULL OR last_channel IN ('call','email','walk-in','text','other')),

  -- Notes / source
  notes TEXT,
  source TEXT,

  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for common filters
CREATE INDEX idx_lcc_status ON public.local_catering_contacts(status);
CREATE INDEX idx_lcc_priority ON public.local_catering_contacts(priority);
CREATE INDEX idx_lcc_next_follow_up ON public.local_catering_contacts(next_follow_up_date);
CREATE INDEX idx_lcc_city ON public.local_catering_contacts(address_city);
CREATE INDEX idx_lcc_use_cases ON public.local_catering_contacts USING GIN(catering_use_cases);

-- Enable RLS
ALTER TABLE public.local_catering_contacts ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins manage local catering contacts"
ON public.local_catering_contacts
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Timestamp trigger (reuses existing public.update_updated_at_column())
CREATE TRIGGER update_local_catering_contacts_updated_at
BEFORE UPDATE ON public.local_catering_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();