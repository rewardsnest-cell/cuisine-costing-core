-- Add API credential fields to suppliers (for integrations like Sysco, US Foods, etc.)
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS api_endpoint text,
  ADD COLUMN IF NOT EXISTS api_username text,
  ADD COLUMN IF NOT EXISTS api_key_secret_name text,
  ADD COLUMN IF NOT EXISTS portal_url text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS delivery_days text;

-- Helper: get the newest processed flyer for a supplier (used by shopping list to find best costs)
CREATE OR REPLACE FUNCTION public.get_active_flyer_for_supplier(_supplier_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.sale_flyers
  WHERE supplier_id = _supplier_id
    AND status = 'processed'
    AND (sale_start_date IS NULL OR sale_start_date <= CURRENT_DATE)
    AND (sale_end_date IS NULL OR sale_end_date >= CURRENT_DATE)
  ORDER BY COALESCE(sale_start_date, created_at::date) DESC, created_at DESC
  LIMIT 1
$$;