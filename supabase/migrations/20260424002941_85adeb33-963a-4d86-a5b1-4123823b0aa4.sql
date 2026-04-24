-- Inspired / Familiar Favorites: tag flag on recipes (home_public only) + signup source capture

-- 1. Flag on recipes
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS inspired boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_recipes_inspired_published
  ON public.recipes (inspired, status)
  WHERE inspired = true;

-- Safety: an `inspired` recipe must be home_public scope. Catering scopes are forbidden.
CREATE OR REPLACE FUNCTION public.recipes_inspired_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.inspired = true AND NEW.scope IS DISTINCT FROM 'home_public' THEN
    RAISE EXCEPTION 'Inspired recipes must have scope=home_public (got %).', NEW.scope;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_inspired_scope_guard ON public.recipes;
CREATE TRIGGER recipes_inspired_scope_guard
  BEFORE INSERT OR UPDATE OF inspired, scope ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipes_inspired_scope_guard();

-- 2. Entry source on recipe email signups (auto-detected from utm_source / referrer, with manual override)
ALTER TABLE public.recipe_email_signups
  ADD COLUMN IF NOT EXISTS entry_source text;

-- Constrain to known values so analytics stays clean. Free-text 'other' is allowed.
ALTER TABLE public.recipe_email_signups
  DROP CONSTRAINT IF EXISTS recipe_email_signups_entry_source_chk;
ALTER TABLE public.recipe_email_signups
  ADD CONSTRAINT recipe_email_signups_entry_source_chk
  CHECK (entry_source IS NULL OR entry_source IN (
    'facebook','instagram','tiktok','youtube','pinterest','email','direct','other'
  ));

CREATE INDEX IF NOT EXISTS idx_recipe_email_signups_entry_source
  ON public.recipe_email_signups (entry_source);