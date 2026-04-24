
-- Add audit trigger for feature_visibility table.
-- Logs visibility_phase_changed, visibility_nav_toggled, visibility_seo_toggled.
CREATE OR REPLACE FUNCTION public.log_feature_visibility_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.access_audit_log (actor_user_id, action, details)
    VALUES (
      actor,
      'visibility_feature_registered',
      jsonb_build_object(
        'feature_key', NEW.feature_key,
        'phase', NEW.phase,
        'nav_enabled', NEW.nav_enabled,
        'seo_indexing_enabled', NEW.seo_indexing_enabled
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.phase IS DISTINCT FROM OLD.phase THEN
      INSERT INTO public.access_audit_log (actor_user_id, action, details)
      VALUES (
        actor,
        'visibility_phase_changed',
        jsonb_build_object(
          'feature_key', NEW.feature_key,
          'previous_phase', OLD.phase,
          'new_phase', NEW.phase
        )
      );
    END IF;
    IF NEW.nav_enabled IS DISTINCT FROM OLD.nav_enabled THEN
      INSERT INTO public.access_audit_log (actor_user_id, action, details)
      VALUES (
        actor,
        'visibility_nav_toggled',
        jsonb_build_object(
          'feature_key', NEW.feature_key,
          'previous_nav_enabled', OLD.nav_enabled,
          'new_nav_enabled', NEW.nav_enabled
        )
      );
    END IF;
    IF NEW.seo_indexing_enabled IS DISTINCT FROM OLD.seo_indexing_enabled THEN
      INSERT INTO public.access_audit_log (actor_user_id, action, details)
      VALUES (
        actor,
        'visibility_seo_toggled',
        jsonb_build_object(
          'feature_key', NEW.feature_key,
          'previous_seo_enabled', OLD.seo_indexing_enabled,
          'new_seo_enabled', NEW.seo_indexing_enabled
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_visibility_audit ON public.feature_visibility;
CREATE TRIGGER trg_feature_visibility_audit
AFTER INSERT OR UPDATE ON public.feature_visibility
FOR EACH ROW
EXECUTE FUNCTION public.log_feature_visibility_change();
