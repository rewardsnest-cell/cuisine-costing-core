-- 1. Extend recipe_shop_items with sponsorship + status metadata
ALTER TABLE public.recipe_shop_items
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'tool',
  ADD COLUMN IF NOT EXISTS is_sponsored boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS campaign_start date,
  ADD COLUMN IF NOT EXISTS campaign_end date,
  ADD COLUMN IF NOT EXISTS onelink_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS clicks_count integer NOT NULL DEFAULT 0;

-- Validation trigger (CHECK constraints would be too rigid for future enum growth)
CREATE OR REPLACE FUNCTION public.validate_recipe_shop_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.category NOT IN ('tool', 'appliance', 'ingredient', 'other') THEN
    RAISE EXCEPTION 'Invalid category: %', NEW.category;
  END IF;
  IF NEW.status NOT IN ('active', 'draft', 'archived') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  IF NEW.campaign_start IS NOT NULL AND NEW.campaign_end IS NOT NULL
     AND NEW.campaign_end < NEW.campaign_start THEN
    RAISE EXCEPTION 'campaign_end must be on or after campaign_start';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_recipe_shop_item ON public.recipe_shop_items;
CREATE TRIGGER trg_validate_recipe_shop_item
  BEFORE INSERT OR UPDATE ON public.recipe_shop_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_recipe_shop_item();

-- 2. Click event log
CREATE TABLE IF NOT EXISTS public.affiliate_click_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_item_id uuid NOT NULL REFERENCES public.recipe_shop_items(id) ON DELETE CASCADE,
  user_id uuid,
  country_code text,
  referrer text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_click_events_item
  ON public.affiliate_click_events(shop_item_id, created_at DESC);

ALTER TABLE public.affiliate_click_events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon visitors) can log a click via the public redirect endpoint.
DROP POLICY IF EXISTS "Anyone can log affiliate clicks" ON public.affiliate_click_events;
CREATE POLICY "Anyone can log affiliate clicks"
  ON public.affiliate_click_events
  FOR INSERT
  WITH CHECK (true);

-- Only admins can read the click log.
DROP POLICY IF EXISTS "Admins can read affiliate clicks" ON public.affiliate_click_events;
CREATE POLICY "Admins can read affiliate clicks"
  ON public.affiliate_click_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Denormalized click counter trigger
CREATE OR REPLACE FUNCTION public.bump_shop_item_clicks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.recipe_shop_items
     SET clicks_count = clicks_count + 1
   WHERE id = NEW.shop_item_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_shop_item_clicks ON public.affiliate_click_events;
CREATE TRIGGER trg_bump_shop_item_clicks
  AFTER INSERT ON public.affiliate_click_events
  FOR EACH ROW EXECUTE FUNCTION public.bump_shop_item_clicks();