-- Familiar Favorites rename: add new feature_visibility key alongside legacy 'inspired'
-- to preserve audit history and backward compatibility. Legacy 'inspired' row remains
-- so historical audit/change-log entries continue to make sense.
INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled, seo_indexing_enabled, notes)
SELECT 'familiar_favorites', phase, nav_enabled, seo_indexing_enabled,
       'Renamed from "inspired". Public label: Familiar Favorites.'
FROM public.feature_visibility WHERE feature_key = 'inspired'
ON CONFLICT (feature_key) DO NOTHING;

-- If 'inspired' row didn't exist for some reason, ensure familiar_favorites still gets a row.
INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled, seo_indexing_enabled, notes)
VALUES ('familiar_favorites', 'admin_preview', false, false, 'Familiar Favorites — home-cook recipes inspired by familiar flavors.')
ON CONFLICT (feature_key) DO NOTHING;