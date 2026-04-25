INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled, notes)
VALUES ('admin_pricing_pipeline', 'public', true, 'Centralized pricing pipeline health & retry page')
ON CONFLICT (feature_key) DO UPDATE SET notes = EXCLUDED.notes;