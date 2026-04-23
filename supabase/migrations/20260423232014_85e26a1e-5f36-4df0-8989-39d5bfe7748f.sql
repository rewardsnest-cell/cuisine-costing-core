-- ============================================================
-- CORE ARCHITECTURE: recipe scope separation (home vs catering)
-- ============================================================
-- Introduces a permanent enum on recipes.scope with three values:
--   home_public         - Public-facing home cooking content (vpsfinest.com/recipes)
--   catering_internal   - Internal-only recipes used in catering menus, quotes, pricing
--   shared_controlled   - Explicit, rare overlap (must be approved/curated)
--
-- Enforcement is at the DATABASE LAYER so that no future code path can leak:
--   * quote_items.recipe_id may ONLY reference catering_internal or shared_controlled
--   * The public recipe-detail loader must filter scope IN ('home_public','shared_controlled')
--
-- This migration does NOT touch:
--   * Cost cascade triggers (trg_recipe_cps_refresh_quote_items)
--   * Quote revision lock (enforce_quote_revision_lock)
--   * Inventory/supplier pricing logic
--   * Public quote lookup RLS or policies
-- ============================================================

-- 1. Enum type
DO $$ BEGIN
  CREATE TYPE public.recipe_scope AS ENUM ('home_public', 'catering_internal', 'shared_controlled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Column on recipes (default catering_internal — safest for unclassified existing rows;
--    they remain invisible to public until explicitly promoted)
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS scope public.recipe_scope NOT NULL DEFAULT 'catering_internal';

CREATE INDEX IF NOT EXISTS idx_recipes_scope ON public.recipes (scope) WHERE active = true;

-- 3. Trigger: quote_items.recipe_id may NEVER reference a home_public recipe
CREATE OR REPLACE FUNCTION public.enforce_quote_item_recipe_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scope public.recipe_scope;
BEGIN
  IF NEW.recipe_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT scope INTO _scope FROM public.recipes WHERE id = NEW.recipe_id;
  IF _scope IS NULL THEN
    RETURN NEW; -- recipe missing; let FK handle it
  END IF;
  IF _scope = 'home_public' THEN
    RAISE EXCEPTION 'home_public recipes cannot be added to catering quotes (recipe_id=%)', NEW.recipe_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_items_enforce_recipe_scope ON public.quote_items;
CREATE TRIGGER trg_quote_items_enforce_recipe_scope
  BEFORE INSERT OR UPDATE OF recipe_id ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_quote_item_recipe_scope();

-- 4. Trigger: if a recipe's scope is changed to home_public while it's used in any quote,
--    block the change to protect catering integrity.
CREATE OR REPLACE FUNCTION public.enforce_recipe_scope_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _used_in_quotes int;
BEGIN
  IF NEW.scope IS DISTINCT FROM OLD.scope AND NEW.scope = 'home_public' THEN
    SELECT count(*) INTO _used_in_quotes
    FROM public.quote_items
    WHERE recipe_id = NEW.id;
    IF _used_in_quotes > 0 THEN
      RAISE EXCEPTION 'Cannot change recipe % to home_public: used in % catering quote item(s). Set to shared_controlled instead.', NEW.id, _used_in_quotes
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recipes_enforce_scope_change ON public.recipes;
CREATE TRIGGER trg_recipes_enforce_scope_change
  BEFORE UPDATE OF scope ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_recipe_scope_change();

-- 5. Helper: stable, security-definer view function for the public recipe surface.
--    Application code should prefer this over raw SELECTs to ensure no internal recipe leaks.
CREATE OR REPLACE FUNCTION public.is_recipe_publicly_visible(_recipe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recipes
    WHERE id = _recipe_id
      AND active = true
      AND scope IN ('home_public', 'shared_controlled')
  );
$$;