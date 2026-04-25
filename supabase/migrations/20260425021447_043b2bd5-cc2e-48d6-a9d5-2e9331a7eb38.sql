INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled, seo_indexing_enabled, notes)
VALUES ('admin_pages_registry', 'public', true, false, 'Registry of all admin pages with viable/active toggles.')
ON CONFLICT (feature_key) DO NOTHING;