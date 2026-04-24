-- Add admin navigation feature flags. These control which links appear in
-- the admin sidebar. Routes still exist; only nav visibility is gated.
--
-- Phase mapping:
--   public         => link visible in admin nav now (Phase 2 ready)
--   admin_preview  => route exists but link hidden until enabled (Phase 3 / experimental)
--   off            => deprecated/legacy; link hidden by default
--
-- nav_enabled additionally gates the link (admin can flip it off without
-- changing phase).

INSERT INTO public.feature_visibility (feature_key, phase, nav_enabled, seo_indexing_enabled, notes) VALUES
  -- 1. Quotes (Phase 2 — primary)
  ('admin_quotes',                'public',        true,  false, 'Admin: Quotes overview & detail.'),
  ('admin_quote_lab',             'public',        true,  false, 'Admin: Quote Lab — internal testing without pricing exposure.'),
  ('admin_concierge_review',      'public',        true,  false, 'Admin: AI Concierge review queue.'),

  -- 2. Pricing Intelligence (Phase 3 — hidden until approved)
  ('admin_pricing_lab',           'admin_preview', false, false, 'Phase 3: Pricing Lab. Hidden until pricing is approved for use.'),
  ('admin_pricing_lab_preview',   'admin_preview', false, false, 'Phase 3: Pricing Lab preview.'),
  ('admin_pricing_test',          'admin_preview', false, false, 'Phase 3: Pricing Test bench.'),
  ('admin_margin_volatility',     'admin_preview', false, false, 'Phase 3: Margin & volatility analytics.'),
  ('admin_national_prices',       'admin_preview', false, false, 'Phase 3: National prices.'),
  ('admin_trends',                'admin_preview', false, false, 'Phase 3: Price trends.'),
  ('admin_kroger_pricing',        'admin_preview', false, false, 'Phase 3: Kroger pricing & SKU review.'),
  ('admin_kroger_sku_review',     'admin_preview', false, false, 'Phase 3: Kroger SKU mapping.'),
  ('admin_kroger_signals',        'admin_preview', false, false, 'Phase 3: Kroger price signals.'),
  ('admin_cost_queue',            'admin_preview', false, false, 'Phase 3: Cost update queue.'),
  ('admin_pricing_visibility',    'admin_preview', false, false, 'Phase 3: Pricing visibility controls.'),

  -- 3. Menu & Content (Phase 2)
  ('admin_recipe_hub',            'public',        true,  false, 'Admin: Recipe Hub.'),
  ('admin_public_menu',           'public',        true,  false, 'Admin: Public menu control.'),
  ('admin_menu_modules',          'public',        true,  false, 'Admin: Menu modules.'),
  ('admin_menu_modules_preview',  'public',        true,  false, 'Admin: Menu modules preview.'),
  ('admin_inspired_preview',      'public',        true,  false, 'Admin: Inspired/Familiar Favorites preview.'),
  ('admin_cooking_guides',        'public',        true,  false, 'Admin: Cooking guides.'),
  ('admin_cooking_lab',           'public',        true,  false, 'Admin: Cooking Lab.'),
  ('admin_newsletter_guide',      'public',        true,  false, 'Admin: Newsletter guide.'),
  ('admin_recipes',               'public',        true,  false, 'Admin: Recipes editor (legacy).'),

  -- 4. Operations (Phase 2)
  ('admin_events',                'public',        true,  false, 'Admin: Events.'),
  ('admin_schedule',              'public',        true,  false, 'Admin: Scheduling.'),
  ('admin_employees',             'public',        true,  false, 'Admin: Employees.'),
  ('admin_timesheets',            'public',        true,  false, 'Admin: Timesheets.'),
  ('admin_purchase_orders',       'public',        true,  false, 'Admin: Purchase orders.'),
  ('admin_inventory',             'public',        true,  false, 'Admin: Inventory & items.'),
  ('admin_items',                 'public',        true,  false, 'Admin: Items & cost intelligence.'),
  ('admin_suppliers',             'public',        true,  false, 'Admin: Suppliers.'),
  ('admin_receipts',              'public',        true,  false, 'Admin: Receipts.'),
  ('admin_users',                 'public',        true,  false, 'Admin: Users management.'),

  -- 5. Market Intelligence (Phase 2)
  ('admin_competitors',           'public',        true,  false, 'Admin: Competitors directory.'),
  ('admin_competitor_quotes',     'public',        true,  false, 'Admin: Competitor quotes.'),
  ('admin_competitor_trends',     'public',        true,  false, 'Admin: Competitor trends.'),
  ('admin_sales_flyers',          'public',        true,  false, 'Admin: Sales & flyers.'),

  -- 6. System & Governance (Phase 2)
  ('admin_feature_visibility',    'public',        true,  false, 'Admin: Feature visibility & phase controls.'),
  ('admin_page_inventory',        'public',        true,  false, 'Admin: Page inventory.'),
  ('admin_audit_log',             'public',        true,  false, 'Admin: Audit log.'),
  ('admin_change_log',            'public',        true,  false, 'Admin: Change log.'),
  ('admin_project_intelligence',  'public',        true,  false, 'Admin: Project intelligence.'),
  ('admin_access_control',        'public',        true,  false, 'Admin: Access control.'),
  ('admin_integrations',          'public',        true,  false, 'Admin: Integrations.'),
  ('admin_brand_assets',          'public',        true,  false, 'Admin: Brand assets.'),
  ('admin_brand_colors',          'public',        true,  false, 'Admin: Brand colors.'),
  ('admin_brand_config',          'public',        true,  false, 'Admin: Brand config.'),
  ('admin_affiliates',            'public',        true,  false, 'Admin: Affiliates.'),
  ('admin_feedback',              'public',        true,  false, 'Admin: Feedback inbox.'),
  ('admin_review_inbox',          'public',        true,  false, 'Admin: Review inbox.'),
  ('admin_uploads',               'public',        true,  false, 'Admin: Uploads inbox.'),
  ('admin_exports',               'public',        true,  false, 'Admin: Exports & reports.'),

  -- Deprecated/legacy (hidden by default)
  ('admin_quick_quote',           'off',           false, false, 'Deprecated: replaced by Quote Lab.'),
  ('admin_import_recipes',        'off',           false, false, 'Legacy: import recipes utility.'),
  ('admin_scan_flyer',            'off',           false, false, 'Legacy: scan flyer (kept as header action).'),
  ('admin_scan_assets',           'off',           false, false, 'Legacy: scan site assets.'),
  ('admin_generate_recipe_photos','off',           false, false, 'Legacy: bulk recipe photo gen.'),
  ('admin_synonyms',              'off',           false, false, 'Legacy: ingredient synonyms.'),
  ('admin_auto_link_ingredients', 'off',           false, false, 'Legacy: auto-link ingredients.'),
  ('admin_servings_review',       'off',           false, false, 'Legacy: servings review.'),
  ('admin_asset_debug',           'off',           false, false, 'Legacy: asset debug tool.'),
  ('admin_set_password',          'off',           false, false, 'Legacy: set password helper.')
ON CONFLICT (feature_key) DO NOTHING;