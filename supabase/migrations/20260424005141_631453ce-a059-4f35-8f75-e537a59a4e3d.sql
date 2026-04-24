-- Menu modules: admin-only structured grouping of catering_internal recipes
CREATE TYPE public.menu_module_state AS ENUM ('active', 'seasonal', 'inactive');

CREATE TABLE public.menu_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  state public.menu_module_state NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.menu_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage menu modules"
ON public.menu_modules
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_menu_modules_touch
BEFORE UPDATE ON public.menu_modules
FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();

-- Recipe assignments: link catering_internal recipes to a module
CREATE TABLE public.menu_module_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.menu_modules(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (module_id, recipe_id)
);

CREATE INDEX idx_menu_module_items_module ON public.menu_module_items(module_id);
CREATE INDEX idx_menu_module_items_recipe ON public.menu_module_items(recipe_id);

ALTER TABLE public.menu_module_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage menu module items"
ON public.menu_module_items
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Enforce: only catering_internal recipes can be added to modules
CREATE OR REPLACE FUNCTION public.enforce_menu_module_item_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scope public.recipe_scope;
BEGIN
  SELECT scope INTO _scope FROM public.recipes WHERE id = NEW.recipe_id;
  IF _scope IS NULL THEN
    RAISE EXCEPTION 'Recipe % not found', NEW.recipe_id;
  END IF;
  IF _scope <> 'catering_internal' THEN
    RAISE EXCEPTION 'Only catering_internal recipes can be added to menu modules (recipe_id=%, scope=%)', NEW.recipe_id, _scope
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_menu_module_items_scope
BEFORE INSERT OR UPDATE ON public.menu_module_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_menu_module_item_scope();