-- ============================================================
-- Competitor Quote Hub (CQH) — schema
-- One event = one workspace. Multi-document upload feeds a
-- single dish list. AI generates a shopping list. Humans
-- approve. Approved list becomes a draft quote. Structural
-- changes after approval create new revisions.
-- ============================================================

-- 1. Events: the workspace shell
CREATE TABLE public.cqh_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date DATE,
  guest_count INTEGER,
  status TEXT NOT NULL DEFAULT 'input',  -- input | shopping_list | approved | draft_quote | sent | accepted | superseded
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Documents (multiple per event)
CREATE TABLE public.cqh_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.cqh_events(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT,
  extracted_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cqh_documents_event_idx ON public.cqh_documents(event_id);

-- 3. Dishes (extracted/curated unified list)
CREATE TABLE public.cqh_dishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.cqh_events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_documents UUID[] DEFAULT '{}',  -- which docs proposed this dish
  is_main BOOLEAN NOT NULL DEFAULT false,
  merged_from UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cqh_dishes_event_idx ON public.cqh_dishes(event_id);

-- 4. Shopping list revisions (each rebuild = new revision)
CREATE TABLE public.cqh_shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.cqh_events(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | approved | superseded
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_by_ai BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, revision_number)
);
CREATE INDEX cqh_sl_event_idx ON public.cqh_shopping_lists(event_id);

-- 5. Shopping list items
CREATE TABLE public.cqh_shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id UUID NOT NULL REFERENCES public.cqh_shopping_lists(id) ON DELETE CASCADE,
  dish_id UUID REFERENCES public.cqh_dishes(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  per_dish_allocation JSONB DEFAULT '{}'::jsonb,  -- {dish_id: qty}
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cqh_sli_list_idx ON public.cqh_shopping_list_items(shopping_list_id);
CREATE INDEX cqh_sli_dish_idx ON public.cqh_shopping_list_items(dish_id);

-- 6. Link a CQH event/shopping list to a quote (reuses existing public.quotes)
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS cqh_event_id UUID REFERENCES public.cqh_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cqh_shopping_list_id UUID REFERENCES public.cqh_shopping_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.quotes(id) ON DELETE SET NULL;

-- 7. Audit log for the hub
CREATE TABLE public.cqh_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.cqh_events(id) ON DELETE CASCADE,
  shopping_list_id UUID REFERENCES public.cqh_shopping_lists(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  action TEXT NOT NULL,  -- documents_uploaded | dishes_merged_or_renamed | shopping_list_generated_by_ai | shopping_list_approved | shopping_list_rebuilt | draft_quote_created | quote_pricing_updated | quote_revision_created | quote_superseded
  payload JSONB DEFAULT '{}'::jsonb,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cqh_audit_event_idx ON public.cqh_audit_log(event_id, created_at DESC);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.cqh_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER cqh_events_touch BEFORE UPDATE ON public.cqh_events
  FOR EACH ROW EXECUTE FUNCTION public.cqh_touch_updated_at();
CREATE TRIGGER cqh_dishes_touch BEFORE UPDATE ON public.cqh_dishes
  FOR EACH ROW EXECUTE FUNCTION public.cqh_touch_updated_at();
CREATE TRIGGER cqh_sl_touch BEFORE UPDATE ON public.cqh_shopping_lists
  FOR EACH ROW EXECUTE FUNCTION public.cqh_touch_updated_at();

-- ============================================================
-- RLS — admin-only
-- ============================================================
ALTER TABLE public.cqh_events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cqh_documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cqh_dishes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cqh_shopping_lists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cqh_shopping_list_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cqh_audit_log             ENABLE ROW LEVEL SECURITY;

-- Use existing has_role(uuid, app_role) helper
CREATE POLICY "cqh_events_admin_all" ON public.cqh_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cqh_documents_admin_all" ON public.cqh_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cqh_dishes_admin_all" ON public.cqh_dishes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cqh_sl_admin_all" ON public.cqh_shopping_lists
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cqh_sli_admin_all" ON public.cqh_shopping_list_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cqh_audit_admin_all" ON public.cqh_audit_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Storage bucket for CQH document uploads (private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('cqh-documents', 'cqh-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "cqh_docs_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cqh-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cqh_docs_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cqh-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cqh_docs_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cqh-documents' AND public.has_role(auth.uid(), 'admin'));