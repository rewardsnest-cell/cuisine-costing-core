-- =========================================
-- Pricing Models (admin-only sandbox)
-- =========================================

CREATE TYPE public.pricing_model_status AS ENUM ('draft', 'active', 'archived');

CREATE TABLE public.pricing_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status public.pricing_model_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID,
  activated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active model at a time
CREATE UNIQUE INDEX pricing_models_one_active_idx
  ON public.pricing_models ((status))
  WHERE status = 'active';

CREATE INDEX pricing_models_status_idx ON public.pricing_models (status);

ALTER TABLE public.pricing_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pricing models"
  ON public.pricing_models
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- Pricing Model Recipes (per-recipe price-per-person inside a model)
-- =========================================

CREATE TABLE public.pricing_model_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_model_id UUID NOT NULL REFERENCES public.pricing_models(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  price_per_person NUMERIC(10,2) NOT NULL CHECK (price_per_person >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pricing_model_id, recipe_id)
);

CREATE INDEX pricing_model_recipes_model_idx ON public.pricing_model_recipes (pricing_model_id);
CREATE INDEX pricing_model_recipes_recipe_idx ON public.pricing_model_recipes (recipe_id);

ALTER TABLE public.pricing_model_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pricing model recipes"
  ON public.pricing_model_recipes
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- Trigger: enforce catering_internal scope
-- =========================================

CREATE OR REPLACE FUNCTION public.enforce_pricing_model_recipe_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _scope public.recipe_scope;
BEGIN
  SELECT scope INTO _scope FROM public.recipes WHERE id = NEW.recipe_id;
  IF _scope IS NULL THEN
    RAISE EXCEPTION 'Recipe % not found', NEW.recipe_id;
  END IF;
  IF _scope <> 'catering_internal' THEN
    RAISE EXCEPTION 'Only catering_internal recipes can be added to pricing models (recipe_id=%, scope=%)', NEW.recipe_id, _scope
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pricing_model_recipes_scope
  BEFORE INSERT OR UPDATE ON public.pricing_model_recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pricing_model_recipe_scope();

-- =========================================
-- Trigger: timestamps + activation/archive bookkeeping
-- =========================================

CREATE OR REPLACE FUNCTION public.trg_pricing_models_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    NEW.activated_at := now();
  END IF;
  IF NEW.status = 'archived' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'archived') THEN
    NEW.archived_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pricing_models_touch
  BEFORE INSERT OR UPDATE ON public.pricing_models
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_pricing_models_touch();

CREATE TRIGGER trg_pricing_model_recipes_touch
  BEFORE UPDATE ON public.pricing_model_recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

-- =========================================
-- Audit log triggers
-- =========================================

CREATE OR REPLACE FUNCTION public.log_pricing_model_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _action text;
  _details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'pricing_model_created';
    _details := jsonb_build_object('id', NEW.id, 'name', NEW.name, 'status', NEW.status);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      _action := 'pricing_model_status_changed';
      _details := jsonb_build_object(
        'id', NEW.id, 'name', NEW.name,
        'previous_status', OLD.status, 'new_status', NEW.status
      );
    ELSE
      _action := 'pricing_model_updated';
      _details := jsonb_build_object('id', NEW.id, 'name', NEW.name, 'status', NEW.status);
    END IF;
  ELSE
    _action := 'pricing_model_deleted';
    _details := jsonb_build_object('id', OLD.id, 'name', OLD.name, 'status', OLD.status);
  END IF;

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES (_action, auth.uid(), _details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_pricing_model_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.pricing_models
  FOR EACH ROW
  EXECUTE FUNCTION public.log_pricing_model_audit();

CREATE OR REPLACE FUNCTION public.log_pricing_model_recipe_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _action text;
  _details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'pricing_model_recipe_added';
    _details := jsonb_build_object(
      'pricing_model_id', NEW.pricing_model_id,
      'recipe_id', NEW.recipe_id,
      'price_per_person', NEW.price_per_person
    );
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'pricing_model_recipe_updated';
    _details := jsonb_build_object(
      'pricing_model_id', NEW.pricing_model_id,
      'recipe_id', NEW.recipe_id,
      'previous_price', OLD.price_per_person,
      'new_price', NEW.price_per_person
    );
  ELSE
    _action := 'pricing_model_recipe_removed';
    _details := jsonb_build_object(
      'pricing_model_id', OLD.pricing_model_id,
      'recipe_id', OLD.recipe_id,
      'price_per_person', OLD.price_per_person
    );
  END IF;

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES (_action, auth.uid(), _details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_pricing_model_recipe_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.pricing_model_recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.log_pricing_model_recipe_audit();