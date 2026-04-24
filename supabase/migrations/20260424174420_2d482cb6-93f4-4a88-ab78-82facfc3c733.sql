-- Phase Two: shareable quote link via reference number, pricing fully hidden.
-- A SECURITY DEFINER function returns only Phase Two-safe columns. No subtotal,
-- total, theoretical_cost, actual_cost, or other financial fields are exposed.

CREATE OR REPLACE FUNCTION public.get_quote_by_reference(_reference text)
RETURNS TABLE (
  reference_number text,
  client_name text,
  event_type text,
  event_date date,
  guest_count integer,
  location_name text,
  status text,
  quote_state quote_state,
  is_test boolean,
  created_at timestamptz,
  updated_at timestamptz,
  dietary_preferences jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.reference_number,
    q.client_name,
    q.event_type,
    q.event_date,
    q.guest_count,
    q.location_name,
    q.status,
    q.quote_state,
    q.is_test,
    q.created_at,
    q.updated_at,
    -- Strip any pricing-adjacent keys defensively, even though we don't write them here.
    (q.dietary_preferences - 'pricing' - 'budget' - 'budgetRange') AS dietary_preferences
  FROM public.quotes q
  WHERE q.reference_number IS NOT NULL
    AND upper(q.reference_number) = upper(_reference)
  LIMIT 1;
$$;

-- Allow public (anon + authenticated) callers to invoke the function.
GRANT EXECUTE ON FUNCTION public.get_quote_by_reference(text) TO anon, authenticated;