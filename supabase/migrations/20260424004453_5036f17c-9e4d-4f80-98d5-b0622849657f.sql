-- Status enum
DO $$ BEGIN
  CREATE TYPE public.cooking_guide_status AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main table
CREATE TABLE public.cooking_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  slug text NOT NULL UNIQUE,
  status public.cooking_guide_status NOT NULL DEFAULT 'draft',
  body text NOT NULL DEFAULT '',
  related_ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX idx_cooking_guides_status ON public.cooking_guides(status);
CREATE INDEX idx_cooking_guides_updated_at ON public.cooking_guides(updated_at DESC);

-- RLS — admin-only
ALTER TABLE public.cooking_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cooking guides"
  ON public.cooking_guides FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert cooking guides"
  ON public.cooking_guides FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update cooking guides"
  ON public.cooking_guides FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete cooking guides"
  ON public.cooking_guides FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Touch updated_at + updated_by
CREATE OR REPLACE FUNCTION public.trg_cooking_guides_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cooking_guides_touch
BEFORE INSERT OR UPDATE ON public.cooking_guides
FOR EACH ROW EXECUTE FUNCTION public.trg_cooking_guides_touch();

-- Publish gate: require title + body
CREATE OR REPLACE FUNCTION public.enforce_cooking_guide_publish_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' THEN
    IF NEW.title IS NULL OR length(trim(NEW.title)) = 0 THEN
      RAISE EXCEPTION 'Cooking guide cannot be published without a title' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.body IS NULL OR length(trim(NEW.body)) = 0 THEN
      RAISE EXCEPTION 'Cooking guide cannot be published without body content' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cooking_guides_publish_gate
BEFORE INSERT OR UPDATE ON public.cooking_guides
FOR EACH ROW EXECUTE FUNCTION public.enforce_cooking_guide_publish_gate();

-- Audit logging
CREATE OR REPLACE FUNCTION public.log_cooking_guide_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action text;
  _details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'cooking_guide_created';
    _details := jsonb_build_object('id', NEW.id, 'title', NEW.title, 'slug', NEW.slug, 'status', NEW.status);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      _action := CASE WHEN NEW.status = 'published' THEN 'cooking_guide_published' ELSE 'cooking_guide_unpublished' END;
    ELSE
      _action := 'cooking_guide_updated';
    END IF;
    _details := jsonb_build_object(
      'id', NEW.id, 'title', NEW.title, 'slug', NEW.slug,
      'status', NEW.status, 'previous_status', OLD.status
    );
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'cooking_guide_deleted';
    _details := jsonb_build_object('id', OLD.id, 'title', OLD.title, 'slug', OLD.slug);
  END IF;

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES (_action, auth.uid(), _details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER cooking_guides_audit
AFTER INSERT OR UPDATE OR DELETE ON public.cooking_guides
FOR EACH ROW EXECUTE FUNCTION public.log_cooking_guide_audit();