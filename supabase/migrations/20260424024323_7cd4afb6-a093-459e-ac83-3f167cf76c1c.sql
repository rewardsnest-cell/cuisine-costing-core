-- 1. Visibility phase enum (separate from inspired_phase to keep concerns clean)
DO $$ BEGIN
  CREATE TYPE public.visibility_phase AS ENUM ('off', 'admin_preview', 'soft_launch', 'public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Registry table
CREATE TABLE IF NOT EXISTS public.feature_visibility (
  feature_key TEXT PRIMARY KEY,
  phase public.visibility_phase NOT NULL DEFAULT 'public',
  nav_enabled BOOLEAN NOT NULL DEFAULT true,
  seo_indexing_enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read feature_visibility" ON public.feature_visibility;
CREATE POLICY "Anyone read feature_visibility"
  ON public.feature_visibility FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage feature_visibility" ON public.feature_visibility;
CREATE POLICY "Admins manage feature_visibility"
  ON public.feature_visibility FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Audit + auto-changelog trigger
CREATE OR REPLACE FUNCTION public.log_feature_visibility_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_email TEXT := (auth.jwt() ->> 'email');
  v_phase_changed BOOLEAN := false;
  v_nav_changed BOOLEAN := false;
  v_seo_changed BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_phase_changed := true;
    v_nav_changed := true;
    v_seo_changed := true;
  ELSE
    v_phase_changed := (OLD.phase IS DISTINCT FROM NEW.phase);
    v_nav_changed := (OLD.nav_enabled IS DISTINCT FROM NEW.nav_enabled);
    v_seo_changed := (OLD.seo_indexing_enabled IS DISTINCT FROM NEW.seo_indexing_enabled);
  END IF;

  IF v_phase_changed THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
    VALUES (v_actor, v_email, 'visibility_phase_changed',
      jsonb_build_object(
        'feature_key', NEW.feature_key,
        'from_phase', COALESCE(OLD.phase::text, NULL),
        'to_phase', NEW.phase::text
      ));

    INSERT INTO public.change_log_entries (title, summary, status, auto_generated, author_user_id, author_email)
    VALUES (
      'Visibility phase changed: ' || NEW.feature_key || ' → ' || NEW.phase::text,
      'Feature "' || NEW.feature_key || '" moved from phase ' ||
        COALESCE(OLD.phase::text, '(new)') || ' to ' || NEW.phase::text || '. ' ||
        CASE NEW.phase::text
          WHEN 'public' THEN 'Now visible to all users.'
          WHEN 'soft_launch' THEN 'Reachable by direct URL, hidden from navigation.'
          WHEN 'admin_preview' THEN 'Visible to admins only.'
          ELSE 'Hidden everywhere.'
        END,
      'draft', true, v_actor, v_email
    );
  END IF;

  IF v_nav_changed AND TG_OP = 'UPDATE' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
    VALUES (v_actor, v_email, 'visibility_nav_toggled',
      jsonb_build_object('feature_key', NEW.feature_key, 'nav_enabled', NEW.nav_enabled));
  END IF;

  IF v_seo_changed AND TG_OP = 'UPDATE' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
    VALUES (v_actor, v_email, 'visibility_seo_toggled',
      jsonb_build_object('feature_key', NEW.feature_key, 'seo_indexing_enabled', NEW.seo_indexing_enabled));

    INSERT INTO public.change_log_entries (title, summary, status, auto_generated, author_user_id, author_email)
    VALUES (
      'SEO indexing ' || CASE WHEN NEW.seo_indexing_enabled THEN 'enabled' ELSE 'disabled' END || ': ' || NEW.feature_key,
      'Feature "' || NEW.feature_key || '" SEO indexing was ' ||
        CASE WHEN NEW.seo_indexing_enabled THEN 'enabled (will be in sitemap, indexable).'
        ELSE 'disabled (excluded from sitemap, noindex).' END,
      'draft', true, v_actor, v_email
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_feature_visibility_change ON public.feature_visibility;
CREATE TRIGGER trg_log_feature_visibility_change
  AFTER INSERT OR UPDATE ON public.feature_visibility
  FOR EACH ROW EXECUTE FUNCTION public.log_feature_visibility_change();

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_feature_visibility_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_touch_feature_visibility ON public.feature_visibility;
CREATE TRIGGER trg_touch_feature_visibility
  BEFORE UPDATE ON public.feature_visibility
  FOR EACH ROW EXECUTE FUNCTION public.touch_feature_visibility_updated_at();

-- 5. Seed initial 11 features, all public (preserves current behavior)
INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled, seo_indexing_enabled, notes) VALUES
  ('inspired',  'public', true, true, 'Inspired / Familiar Favorites recipes hub.'),
  ('recipes',   'public', true, true, 'Public recipes index and detail pages.'),
  ('guides',    'public', true, true, 'Cooking guides index and detail.'),
  ('menu',      'public', true, true, 'Public catering menu page.'),
  ('catering',  'public', true, true, 'Catering landing page.'),
  ('blog',      'public', true, true, 'Blog index and posts.'),
  ('weddings',  'public', true, true, 'Weddings hub and SEO landing pages.'),
  ('quote',     'public', true, true, 'Quote builder and AI quote.'),
  ('follow',    'public', true, true, 'Follow / social hub page.'),
  ('lookup',    'public', true, true, 'Quote lookup page.'),
  ('coupon',    'public', true, true, 'Coupon detail pages.')
ON CONFLICT (feature_key) DO NOTHING;