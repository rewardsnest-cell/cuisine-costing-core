WITH desired(feature_key, phase, nav_enabled, notes) AS (
  VALUES
    ('admin_quote_ai_review',     'public',        true,  'Quotes group · AI concierge review queue'),
    ('admin_menu_control',        'public',        true,  'Menu & Content · Public menu control'),
    ('admin_brand_management',    'public',        true,  'System & Governance · Brand Config / Colors / Assets group'),
    ('admin_pricing_intelligence','admin_preview', false, 'Pricing Intelligence section gate (Phase Three)'),
    ('admin_receipt_diagnostics', 'admin_preview', false, 'Pricing · Receipt Kroger diagnostics'),
    ('admin_legacy_recipes',      'off',           false, 'Legacy · old Recipes index, replaced by Recipe Hub')
)
INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled, seo_indexing_enabled, notes)
SELECT d.feature_key, d.phase::visibility_phase, d.nav_enabled, false, d.notes
FROM desired d
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_visibility fv WHERE fv.feature_key = d.feature_key
);

UPDATE public.feature_visibility
SET phase = 'admin_preview'::visibility_phase, nav_enabled = false
WHERE feature_key IN (
  'admin_pricing_intelligence',
  'admin_pricing_lab',
  'admin_pricing_lab_preview',
  'admin_pricing_test',
  'admin_pricing_visibility',
  'admin_margin_volatility',
  'admin_national_prices',
  'admin_price_trends',
  'admin_kroger_pricing',
  'admin_kroger_sku_review',
  'admin_cost_queue',
  'admin_receipt_diagnostics'
)
AND (phase <> 'admin_preview'::visibility_phase OR nav_enabled = true);

UPDATE public.feature_visibility
SET phase = 'off'::visibility_phase, nav_enabled = false
WHERE feature_key IN ('admin_quick_quote', 'admin_legacy_recipes')
AND (phase <> 'off'::visibility_phase OR nav_enabled = true);