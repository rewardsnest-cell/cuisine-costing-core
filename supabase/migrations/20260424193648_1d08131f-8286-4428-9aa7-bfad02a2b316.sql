INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled) VALUES
  ('admin_quick_quote','off',false),
  ('admin_legacy_recipes','off',false)
ON CONFLICT (feature_key) DO UPDATE
  SET phase = 'off',
      nav_enabled = false,
      updated_at = now();