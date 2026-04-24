INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled) VALUES
  ('admin_pricing_intelligence','admin_preview',false),
  ('admin_pricing_lab','admin_preview',false),
  ('admin_pricing_lab_preview','admin_preview',false),
  ('admin_pricing_test','admin_preview',false),
  ('admin_pricing_visibility','admin_preview',false),
  ('admin_margin_volatility','admin_preview',false),
  ('admin_national_prices','admin_preview',false),
  ('admin_price_trends','admin_preview',false),
  ('admin_kroger_pricing','admin_preview',false),
  ('admin_kroger_sku_review','admin_preview',false),
  ('admin_cost_queue','admin_preview',false),
  ('admin_receipt_diagnostics','admin_preview',false)
ON CONFLICT (feature_key) DO UPDATE
  SET phase = 'admin_preview',
      nav_enabled = false,
      updated_at = now();