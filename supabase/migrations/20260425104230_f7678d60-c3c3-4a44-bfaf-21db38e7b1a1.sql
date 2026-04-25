ALTER TABLE public.cqh_dishes
  ADD COLUMN IF NOT EXISTS source_qty numeric,
  ADD COLUMN IF NOT EXISTS source_unit text,
  ADD COLUMN IF NOT EXISTS source_unit_price numeric,
  ADD COLUMN IF NOT EXISTS source_line_total numeric,
  ADD COLUMN IF NOT EXISTS source_category text,
  ADD COLUMN IF NOT EXISTS source_notes text,
  ADD COLUMN IF NOT EXISTS source_raw text;