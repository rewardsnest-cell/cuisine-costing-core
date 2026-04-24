
-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.inspired_phase AS ENUM ('off','admin_preview','soft_launch','public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Recipes columns
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS inspired_phase public.inspired_phase NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS inspired_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS recipes_inspired_slug_unique
  ON public.recipes(inspired_slug) WHERE inspired_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS recipes_inspired_phase_idx
  ON public.recipes(inspired_phase) WHERE inspired = true;

-- 3. Default nav setting
INSERT INTO public.app_kv (key, value)
VALUES ('inspired.nav_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- 4. Audit + change-log trigger for inspired changes
CREATE OR REPLACE FUNCTION public.log_inspired_recipe_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_phase_changed boolean := false;
  v_inspired_changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_inspired_changed := COALESCE(NEW.inspired,false) IS DISTINCT FROM COALESCE(OLD.inspired,false);
    v_phase_changed := NEW.inspired_phase IS DISTINCT FROM OLD.inspired_phase;
  ELSIF TG_OP = 'INSERT' THEN
    v_inspired_changed := COALESCE(NEW.inspired,false) = true;
    v_phase_changed := NEW.inspired_phase <> 'off';
  END IF;

  IF NOT (v_inspired_changed OR v_phase_changed) THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_actor;

  IF v_inspired_changed THEN
    INSERT INTO public.access_audit_log(actor_user_id, actor_email, action, target_user_id, target_email, details)
    VALUES (
      v_actor, v_email,
      CASE WHEN COALESCE(NEW.inspired,false) THEN 'inspired_recipe_added' ELSE 'inspired_recipe_removed' END,
      NULL, NULL,
      jsonb_build_object('recipe_id', NEW.id, 'recipe_name', NEW.name, 'phase', NEW.inspired_phase)
    );
  END IF;

  IF v_phase_changed THEN
    INSERT INTO public.access_audit_log(actor_user_id, actor_email, action, details)
    VALUES (
      v_actor, v_email, 'inspired_phase_changed',
      jsonb_build_object(
        'recipe_id', NEW.id,
        'recipe_name', NEW.name,
        'from_phase', CASE WHEN TG_OP='UPDATE' THEN OLD.inspired_phase::text ELSE NULL END,
        'to_phase', NEW.inspired_phase::text
      )
    );

    -- Draft change log entry only on phase changes (signal moments)
    INSERT INTO public.change_log_entries(title, summary, status, auto_generated, author_user_id, author_email)
    VALUES (
      'Inspired phase changed: ' || NEW.name,
      'Recipe "' || NEW.name || '" moved to phase "' || NEW.inspired_phase::text || '".',
      'draft', true, v_actor, v_email
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_inspired_recipe_change ON public.recipes;
CREATE TRIGGER trg_log_inspired_recipe_change
AFTER INSERT OR UPDATE OF inspired, inspired_phase ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.log_inspired_recipe_change();

-- 5. Audit + change-log trigger for nav setting changes (app_kv)
CREATE OR REPLACE FUNCTION public.log_inspired_nav_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
BEGIN
  IF NEW.key <> 'inspired.nav_enabled' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.value IS NOT DISTINCT FROM OLD.value THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_actor;

  INSERT INTO public.access_audit_log(actor_user_id, actor_email, action, details)
  VALUES (v_actor, v_email, 'inspired_nav_enabled',
    jsonb_build_object('value', NEW.value));

  INSERT INTO public.change_log_entries(title, summary, status, auto_generated, author_user_id, author_email)
  VALUES (
    'Inspired nav visibility changed',
    'Inspired link in main navigation set to "' || COALESCE(NEW.value,'null') || '".',
    'draft', true, v_actor, v_email
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_inspired_nav_change ON public.app_kv;
CREATE TRIGGER trg_log_inspired_nav_change
AFTER INSERT OR UPDATE ON public.app_kv
FOR EACH ROW EXECUTE FUNCTION public.log_inspired_nav_change();
