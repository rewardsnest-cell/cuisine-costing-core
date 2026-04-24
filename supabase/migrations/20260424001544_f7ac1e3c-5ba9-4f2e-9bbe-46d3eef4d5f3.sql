-- 1. Recipe lifecycle status (DRAFT vs PUBLISHED).
--    Existing recipes are grandfathered as 'published' so live content is never disturbed.
--    New recipes default to 'draft' so the publish gate applies.
CREATE TYPE public.recipe_status AS ENUM ('draft', 'published');

ALTER TABLE public.recipes
  ADD COLUMN status public.recipe_status NOT NULL DEFAULT 'draft';

-- Grandfather existing rows
UPDATE public.recipes SET status = 'published' WHERE status = 'draft';

-- New rows still default to 'draft' for the publish gate
ALTER TABLE public.recipes ALTER COLUMN status SET DEFAULT 'draft';

-- Track originating source so admins can see how a recipe entered the system
ALTER TABLE public.recipes
  ADD COLUMN created_source text NOT NULL DEFAULT 'manual';
COMMENT ON COLUMN public.recipes.created_source IS 'manual | ai | import | copycat';

-- 2. Helper: does a recipe have any unresolved ingredient lines?
CREATE OR REPLACE FUNCTION public.recipe_has_unresolved_ingredients(_recipe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipe_ingredients ri
    WHERE ri.recipe_id = _recipe_id
      AND (
        ri.reference_id IS NULL
        OR ri.unit IS NULL
        OR length(trim(ri.unit)) = 0
        OR ri.quantity IS NULL
        OR ri.quantity <= 0
      )
  );
$$;

-- 3. Publish gate: a recipe cannot move from draft -> published, and cannot
--    change scope while in draft, unless every ingredient line is resolved
--    (linked to ingredient_reference, has a unit, and has a positive quantity).
--    Admins do NOT get a bypass — the whole point is integrity at creation time.
CREATE OR REPLACE FUNCTION public.enforce_recipe_publish_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ingredient_count int;
BEGIN
  -- Block publish transition when ingredients are unresolved
  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN

    SELECT count(*) INTO _ingredient_count
    FROM public.recipe_ingredients
    WHERE recipe_id = NEW.id;

    IF _ingredient_count = 0 THEN
      RAISE EXCEPTION 'Recipe % cannot be published: at least one ingredient is required', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;

    IF public.recipe_has_unresolved_ingredients(NEW.id) THEN
      RAISE EXCEPTION 'Recipe % cannot be published: every ingredient must be linked to ingredient_reference with a canonical unit and positive quantity', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Block scope change away from defaults while still in draft
  IF NEW.status = 'draft'
     AND TG_OP = 'UPDATE'
     AND NEW.scope IS DISTINCT FROM OLD.scope
     AND public.recipe_has_unresolved_ingredients(NEW.id) THEN
    RAISE EXCEPTION 'Recipe % scope cannot change while in draft with unresolved ingredients', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER recipe_publish_gate
  BEFORE INSERT OR UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_recipe_publish_gate();

-- 4. Free-text ingredient lines (no reference_id) are allowed only while the
--    parent recipe is in draft. This blocks publishing-then-editing-with-junk.
CREATE OR REPLACE FUNCTION public.enforce_recipe_ingredient_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status public.recipe_status;
BEGIN
  SELECT status INTO _status FROM public.recipes WHERE id = NEW.recipe_id;
  IF _status IS NULL THEN
    RETURN NEW; -- recipe missing; FK will catch it
  END IF;

  IF _status = 'published' AND NEW.reference_id IS NULL THEN
    RAISE EXCEPTION 'Cannot add a free-text ingredient (%) to a published recipe; link it to ingredient_reference first or move the recipe back to draft', NEW.name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER recipe_ingredient_resolved_gate
  BEFORE INSERT OR UPDATE ON public.recipe_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_recipe_ingredient_resolved();

-- 5. Audit log: write to existing access_audit_log whenever a recipe ingredient
--    is created, deleted, or has its reference_id changed. No new table.
CREATE OR REPLACE FUNCTION public.log_recipe_ingredient_audit()
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
    _action := CASE WHEN NEW.reference_id IS NOT NULL
                    THEN 'recipe_ingredient_resolved'
                    ELSE 'recipe_ingredient_unresolved' END;
    _details := jsonb_build_object(
      'recipe_id', NEW.recipe_id,
      'ingredient_name', NEW.name,
      'reference_id', NEW.reference_id,
      'inventory_item_id', NEW.inventory_item_id,
      'unit', NEW.unit,
      'quantity', NEW.quantity
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.reference_id IS DISTINCT FROM OLD.reference_id THEN
      _action := CASE WHEN NEW.reference_id IS NOT NULL
                      THEN 'recipe_ingredient_resolved'
                      ELSE 'recipe_ingredient_unlinked' END;
      _details := jsonb_build_object(
        'recipe_id', NEW.recipe_id,
        'ingredient_name', NEW.name,
        'previous_reference_id', OLD.reference_id,
        'reference_id', NEW.reference_id,
        'inventory_item_id', NEW.inventory_item_id,
        'unit', NEW.unit,
        'quantity', NEW.quantity
      );
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'recipe_ingredient_removed';
    _details := jsonb_build_object(
      'recipe_id', OLD.recipe_id,
      'ingredient_name', OLD.name,
      'reference_id', OLD.reference_id,
      'inventory_item_id', OLD.inventory_item_id
    );
  END IF;

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES (_action, auth.uid(), _details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER recipe_ingredient_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.recipe_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.log_recipe_ingredient_audit();

-- 6. Mark recipes that legacy-grandfathered with unresolved ingredients so the
--    admin UI can surface a "needs cleanup" badge without forcing them to draft.
ALTER TABLE public.recipes
  ADD COLUMN ingredient_integrity text NOT NULL DEFAULT 'ok';
COMMENT ON COLUMN public.recipes.ingredient_integrity IS 'ok | needs_cleanup — set on legacy published recipes that still have unresolved ingredient lines';

UPDATE public.recipes r
SET ingredient_integrity = 'needs_cleanup'
WHERE r.status = 'published'
  AND EXISTS (
    SELECT 1 FROM public.recipe_ingredients ri
    WHERE ri.recipe_id = r.id
      AND (ri.reference_id IS NULL OR ri.unit IS NULL OR length(trim(ri.unit)) = 0 OR ri.quantity IS NULL OR ri.quantity <= 0)
  );

-- Keep the integrity flag self-healing as ingredient lines are fixed/added
CREATE OR REPLACE FUNCTION public.refresh_recipe_integrity_flag(_recipe_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.recipes
  SET ingredient_integrity = CASE
    WHEN public.recipe_has_unresolved_ingredients(_recipe_id) THEN 'needs_cleanup'
    ELSE 'ok'
  END
  WHERE id = _recipe_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_recipe_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_recipe_integrity_flag(OLD.recipe_id);
    RETURN OLD;
  ELSE
    PERFORM public.refresh_recipe_integrity_flag(NEW.recipe_id);
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER recipe_integrity_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.recipe_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_recipe_integrity();