
UPDATE public.feature_visibility
SET phase = 'public',
    nav_enabled = true,
    updated_at = now()
WHERE feature_key IN (
  'admin_pricing_intelligence',
  'admin_pricing_lab',
  'admin_pricing_lab_preview',
  'admin_pricing_test',
  'admin_pricing_visibility',
  'admin_margin_volatility',
  'admin_kroger_pricing',
  'admin_kroger_sku_review',
  'admin_cost_queue',
  'admin_receipt_diagnostics'
);
