-- Audit log for menu_modules
CREATE OR REPLACE FUNCTION public.log_menu_module_audit()
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
    _action := 'menu_module_created';
    _details := jsonb_build_object('id', NEW.id, 'name', NEW.name, 'state', NEW.state, 'position', NEW.position);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.state IS DISTINCT FROM OLD.state THEN
      _action := 'menu_module_state_changed';
      _details := jsonb_build_object('id', NEW.id, 'name', NEW.name, 'previous_state', OLD.state, 'new_state', NEW.state);
    ELSIF NEW.position IS DISTINCT FROM OLD.position THEN
      _action := 'menu_module_reordered';
      _details := jsonb_build_object('id', NEW.id, 'name', NEW.name, 'previous_position', OLD.position, 'new_position', NEW.position);
    ELSE
      _action := 'menu_module_updated';
      _details := jsonb_build_object('id', NEW.id, 'name', NEW.name, 'state', NEW.state);
    END IF;
  ELSE
    _action := 'menu_module_deleted';
    _details := jsonb_build_object('id', OLD.id, 'name', OLD.name, 'state', OLD.state);
  END IF;

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES (_action, auth.uid(), _details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_menu_module_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.menu_modules
  FOR EACH ROW EXECUTE FUNCTION public.log_menu_module_audit();

-- Audit log for menu_module_items
CREATE OR REPLACE FUNCTION public.log_menu_module_item_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _action text;
  _details jsonb;
  _recipe_name text;
  _module_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO _recipe_name FROM public.recipes WHERE id = NEW.recipe_id;
    SELECT name INTO _module_name FROM public.menu_modules WHERE id = NEW.module_id;
    _action := 'menu_module_recipe_added';
    _details := jsonb_build_object(
      'module_id', NEW.module_id, 'module_name', _module_name,
      'recipe_id', NEW.recipe_id, 'recipe_name', _recipe_name
    );
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name INTO _recipe_name FROM public.recipes WHERE id = OLD.recipe_id;
    SELECT name INTO _module_name FROM public.menu_modules WHERE id = OLD.module_id;
    _action := 'menu_module_recipe_removed';
    _details := jsonb_build_object(
      'module_id', OLD.module_id, 'module_name', _module_name,
      'recipe_id', OLD.recipe_id, 'recipe_name', _recipe_name
    );
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.access_audit_log (action, actor_user_id, details)
  VALUES (_action, auth.uid(), _details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_menu_module_item_audit
  AFTER INSERT OR DELETE ON public.menu_module_items
  FOR EACH ROW EXECUTE FUNCTION public.log_menu_module_item_audit();