
INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled, seo_indexing_enabled, notes)
VALUES
  ('admin_pricing_code_inventory', 'public', true, false, 'Read-only catalogue of pricing/cost code in the repo.'),
  ('admin_pricing_intelligence',   'public', true, false, 'Pricing Intelligence sidebar group.')
ON CONFLICT (feature_key) DO UPDATE
SET phase = 'public',
    nav_enabled = true,
    notes = COALESCE(public.feature_visibility.notes, EXCLUDED.notes),
    updated_at = now();
