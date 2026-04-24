
-- =============================================================
-- Round 2 Governance Hardening
-- A. Audit coverage expansion (recipes CRUD, quotes, employees, time approvals, section permissions)
-- B. Change-log auto-draft generation for significant audit events
-- =============================================================

-- ---------- RECIPES (CRUD audit) ----------
CREATE OR REPLACE FUNCTION public.log_recipe_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := (auth.jwt() ->> 'email');
  v_action text;
  v_details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'recipe_created';
    v_details := jsonb_build_object(
      'id', NEW.id, 'name', NEW.name,
      'active', NEW.active,
      'inspired_phase', NEW.inspired_phase,
      'show_on_home', NEW.show_on_home,
      'is_inspired', NEW.is_inspired
    );
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
    VALUES (v_actor, v_email, v_action, v_details);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Specific change events first, then a generic update if anything else changed
    IF NEW.show_on_home IS DISTINCT FROM OLD.show_on_home THEN
      INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
      VALUES (v_actor, v_email, 'recipe_home_public_toggled',
        jsonb_build_object('id', NEW.id, 'name', NEW.name,
          'previous', OLD.show_on_home, 'new', NEW.show_on_home));
    END IF;
    IF NEW.is_inspired IS DISTINCT FROM OLD.is_inspired THEN
      INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
      VALUES (v_actor, v_email, 'inspired_flag_toggled',
        jsonb_build_object('id', NEW.id, 'name', NEW.name,
          'previous', OLD.is_inspired, 'new', NEW.is_inspired));
    END IF;
    IF NEW.inspired_phase IS DISTINCT FROM OLD.inspired_phase THEN
      INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
      VALUES (v_actor, v_email, 'inspired_phase_changed',
        jsonb_build_object('id', NEW.id, 'name', NEW.name,
          'previous_phase', OLD.inspired_phase, 'new_phase', NEW.inspired_phase));

      -- Auto-draft change log when an Inspired recipe goes public
      IF NEW.inspired_phase = 'public' AND COALESCE(OLD.inspired_phase::text, '') <> 'public' THEN
        INSERT INTO public.change_log_entries (title, summary, status, auto_generated, author_user_id, author_email)
        VALUES (
          'Inspired recipe published: ' || NEW.name,
          'Recipe "' || NEW.name || '" Inspired phase moved from ' ||
            COALESCE(OLD.inspired_phase::text, '(new)') || ' to public.',
          'draft', true, v_actor, v_email
        );
      END IF;
    END IF;

    -- Generic update event (only when something other than the specific toggles above changed)
    IF (NEW.name IS DISTINCT FROM OLD.name)
       OR (NEW.description IS DISTINCT FROM OLD.description)
       OR (NEW.active IS DISTINCT FROM OLD.active)
       OR (NEW.category IS DISTINCT FROM OLD.category)
       OR (NEW.servings IS DISTINCT FROM OLD.servings) THEN
      INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
      VALUES (v_actor, v_email, 'recipe_updated',
        jsonb_build_object('id', NEW.id, 'name', NEW.name,
          'changed', jsonb_build_object(
            'name', NEW.name IS DISTINCT FROM OLD.name,
            'description', NEW.description IS DISTINCT FROM OLD.description,
            'active', NEW.active IS DISTINCT FROM OLD.active,
            'category', NEW.category IS DISTINCT FROM OLD.category,
            'servings', NEW.servings IS DISTINCT FROM OLD.servings
          )));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
    VALUES (v_actor, v_email, 'recipe_deleted',
      jsonb_build_object('id', OLD.id, 'name', OLD.name));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recipe_audit ON public.recipes;
CREATE TRIGGER trg_recipe_audit
AFTER INSERT OR UPDATE OR DELETE ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.log_recipe_audit();

-- ---------- QUOTES (create / update / status change) ----------
CREATE OR REPLACE FUNCTION public.log_quote_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := (auth.jwt() ->> 'email');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
    VALUES (v_actor, v_email, 'quote_created',
      jsonb_build_object('id', NEW.id, 'reference_number', NEW.reference_number,
        'status', NEW.status, 'guest_count', NEW.guest_count, 'total', NEW.total));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
      VALUES (v_actor, v_email, 'quote_status_changed',
        jsonb_build_object('id', NEW.id, 'reference_number', NEW.reference_number,
          'previous_status', OLD.status, 'new_status', NEW.status));
    ELSIF (NEW.total IS DISTINCT FROM OLD.total)
       OR (NEW.guest_count IS DISTINCT FROM OLD.guest_count)
       OR (NEW.event_date IS DISTINCT FROM OLD.event_date)
       OR (NEW.client_name IS DISTINCT FROM OLD.client_name)
       OR (NEW.notes IS DISTINCT FROM OLD.notes) THEN
      INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
      VALUES (v_actor, v_email, 'quote_updated',
        jsonb_build_object('id', NEW.id, 'reference_number', NEW.reference_number,
          'changed', jsonb_build_object(
            'total', NEW.total IS DISTINCT FROM OLD.total,
            'guest_count', NEW.guest_count IS DISTINCT FROM OLD.guest_count,
            'event_date', NEW.event_date IS DISTINCT FROM OLD.event_date,
            'client_name', NEW.client_name IS DISTINCT FROM OLD.client_name,
            'notes', NEW.notes IS DISTINCT FROM OLD.notes
          )));
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_audit ON public.quotes;
CREATE TRIGGER trg_quote_audit
AFTER INSERT OR UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.log_quote_audit();

-- ---------- EMPLOYEE INVITES (invite / role change) ----------
CREATE OR REPLACE FUNCTION public.log_employee_invite_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := (auth.jwt() ->> 'email');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, target_email, details)
    VALUES (v_actor, v_email, 'employee_invited', NEW.email,
      jsonb_build_object('id', NEW.id, 'role', NEW.role, 'status', NEW.status));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, target_email, target_user_id, details)
      VALUES (v_actor, v_email, 'employee_role_changed', NEW.email, NEW.invited_user_id,
        jsonb_build_object('id', NEW.id, 'previous_role', OLD.role, 'new_role', NEW.role));
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_invite_audit ON public.employee_invites;
CREATE TRIGGER trg_employee_invite_audit
AFTER INSERT OR UPDATE ON public.employee_invites
FOR EACH ROW EXECUTE FUNCTION public.log_employee_invite_audit();

-- ---------- TIME ENTRY APPROVAL (approved / rejected) ----------
CREATE OR REPLACE FUNCTION public.log_time_entry_approval_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := (auth.jwt() ->> 'email');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'approved' THEN
      INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, target_user_id, details)
      VALUES (v_actor, v_email, 'time_entry_approved', NEW.employee_user_id,
        jsonb_build_object('id', NEW.id, 'quote_id', NEW.quote_id,
          'clock_in_at', NEW.clock_in_at, 'clock_out_at', NEW.clock_out_at));
    ELSIF NEW.approval_status = 'rejected' THEN
      INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, target_user_id, details)
      VALUES (v_actor, v_email, 'time_entry_rejected', NEW.employee_user_id,
        jsonb_build_object('id', NEW.id, 'quote_id', NEW.quote_id,
          'notes', NEW.approval_notes));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_entry_approval_audit ON public.event_time_entries;
CREATE TRIGGER trg_time_entry_approval_audit
AFTER UPDATE ON public.event_time_entries
FOR EACH ROW EXECUTE FUNCTION public.log_time_entry_approval_audit();

-- ---------- SECTION PERMISSIONS (grant / revoke) ----------
CREATE OR REPLACE FUNCTION public.log_role_section_permission_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := (auth.jwt() ->> 'email');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
    VALUES (v_actor, v_email,
      CASE WHEN NEW.enabled THEN 'section_permission_granted' ELSE 'section_permission_revoked' END,
      jsonb_build_object('scope', 'role', 'role', NEW.role, 'section', NEW.section, 'enabled', NEW.enabled));
  ELSIF TG_OP = 'UPDATE' AND NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
    VALUES (v_actor, v_email,
      CASE WHEN NEW.enabled THEN 'section_permission_granted' ELSE 'section_permission_revoked' END,
      jsonb_build_object('scope', 'role', 'role', NEW.role, 'section', NEW.section,
        'previous', OLD.enabled, 'new', NEW.enabled));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, details)
    VALUES (v_actor, v_email, 'section_permission_revoked',
      jsonb_build_object('scope', 'role', 'role', OLD.role, 'section', OLD.section, 'removed', true));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_role_section_permission_audit ON public.role_section_permissions;
CREATE TRIGGER trg_role_section_permission_audit
AFTER INSERT OR UPDATE OR DELETE ON public.role_section_permissions
FOR EACH ROW EXECUTE FUNCTION public.log_role_section_permission_audit();

CREATE OR REPLACE FUNCTION public.log_user_section_override_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := (auth.jwt() ->> 'email');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, target_user_id, details)
    VALUES (v_actor, v_email,
      CASE WHEN NEW.enabled THEN 'section_permission_granted' ELSE 'section_permission_revoked' END,
      NEW.user_id,
      jsonb_build_object('scope', 'user', 'section', NEW.section, 'enabled', NEW.enabled));
  ELSIF TG_OP = 'UPDATE' AND NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, target_user_id, details)
    VALUES (v_actor, v_email,
      CASE WHEN NEW.enabled THEN 'section_permission_granted' ELSE 'section_permission_revoked' END,
      NEW.user_id,
      jsonb_build_object('scope', 'user', 'section', NEW.section,
        'previous', OLD.enabled, 'new', NEW.enabled));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.access_audit_log (actor_user_id, actor_email, action, target_user_id, details)
    VALUES (v_actor, v_email, 'section_permission_revoked', OLD.user_id,
      jsonb_build_object('scope', 'user', 'section', OLD.section, 'removed', true));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_user_section_override_audit ON public.user_section_overrides;
CREATE TRIGGER trg_user_section_override_audit
AFTER INSERT OR UPDATE OR DELETE ON public.user_section_overrides
FOR EACH ROW EXECUTE FUNCTION public.log_user_section_override_audit();

-- =============================================================
-- B. CHANGE-LOG AUTO-DRAFT for significant events
--   (visibility phase changes already covered by existing
--    log_feature_visibility_change function — kept as-is.)
-- =============================================================

-- B1. Cooking guide visibility (publish / unpublish) → draft change-log entry.
CREATE OR REPLACE FUNCTION public.draft_change_log_for_guide_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := (auth.jwt() ->> 'email');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'published' THEN
      INSERT INTO public.change_log_entries (title, summary, status, auto_generated, author_user_id, author_email)
      VALUES (
        'Cooking guide published: ' || NEW.title,
        'Guide "' || NEW.title || '" is now published and visible to the public.',
        'draft', true, v_actor, v_email
      );
    ELSIF OLD.status = 'published' AND NEW.status <> 'published' THEN
      INSERT INTO public.change_log_entries (title, summary, status, auto_generated, author_user_id, author_email)
      VALUES (
        'Cooking guide unpublished: ' || NEW.title,
        'Guide "' || NEW.title || '" was moved from published to ' || NEW.status::text || '.',
        'draft', true, v_actor, v_email
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_draft_change_log_guide ON public.cooking_guides;
CREATE TRIGGER trg_draft_change_log_guide
AFTER UPDATE ON public.cooking_guides
FOR EACH ROW EXECUTE FUNCTION public.draft_change_log_for_guide_publish();

-- B2. Menu module state change → draft change-log entry.
CREATE OR REPLACE FUNCTION public.draft_change_log_for_menu_module_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := (auth.jwt() ->> 'email');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.state IS DISTINCT FROM OLD.state THEN
    INSERT INTO public.change_log_entries (title, summary, status, auto_generated, author_user_id, author_email)
    VALUES (
      'Menu module state changed: ' || NEW.name || ' → ' || NEW.state::text,
      'Menu module "' || NEW.name || '" moved from ' || OLD.state::text || ' to ' || NEW.state::text || '.',
      'draft', true, v_actor, v_email
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_draft_change_log_menu_module ON public.menu_modules;
CREATE TRIGGER trg_draft_change_log_menu_module
AFTER UPDATE ON public.menu_modules
FOR EACH ROW EXECUTE FUNCTION public.draft_change_log_for_menu_module_state();

-- B3. Pricing model activated / archived → draft change-log entry.
CREATE OR REPLACE FUNCTION public.draft_change_log_for_pricing_model_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := (auth.jwt() ->> 'email');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text IN ('active', 'archived') THEN
      INSERT INTO public.change_log_entries (title, summary, status, auto_generated, author_user_id, author_email)
      VALUES (
        'Pricing model ' || NEW.status::text || ': ' || NEW.name,
        'Pricing model "' || NEW.name || '" status moved from ' || OLD.status::text || ' to ' || NEW.status::text || '.',
        'draft', true, v_actor, v_email
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_draft_change_log_pricing_model ON public.pricing_models;
CREATE TRIGGER trg_draft_change_log_pricing_model
AFTER UPDATE ON public.pricing_models
FOR EACH ROW EXECUTE FUNCTION public.draft_change_log_for_pricing_model_status();

-- B4. Cost update queue: when a >5% change is approved → draft change-log entry.
CREATE OR REPLACE FUNCTION public.draft_change_log_for_cost_update_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := (auth.jwt() ->> 'email');
  v_pct numeric;
  v_name text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = 'approved' THEN
    v_pct := COALESCE(NEW.percent_change, 0);
    IF abs(v_pct) > 5 THEN
      SELECT canonical_name INTO v_name
      FROM public.ingredient_reference
      WHERE id = NEW.reference_id;
      INSERT INTO public.change_log_entries (title, summary, status, auto_generated, author_user_id, author_email)
      VALUES (
        'Cost update approved (>5%): ' || COALESCE(v_name, NEW.reference_id::text),
        'A cost update of ' || round(v_pct, 2)::text || '% was approved for "' ||
          COALESCE(v_name, NEW.reference_id::text) || '" (source: ' || NEW.source || ').',
        'draft', true, v_actor, v_email
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_draft_change_log_cost_update ON public.cost_update_queue;
CREATE TRIGGER trg_draft_change_log_cost_update
AFTER UPDATE ON public.cost_update_queue
FOR EACH ROW EXECUTE FUNCTION public.draft_change_log_for_cost_update_approval();
