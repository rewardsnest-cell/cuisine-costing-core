# Preserve full dish info during extraction

Right now when the Quote Hub extracts dishes from uploaded files (spreadsheets, PDFs, docs), it only keeps the dish **name** and an `is_main` flag. Everything else on the source spreadsheet — prices, quantities, units, categories, notes — is thrown away. We will keep all of it so admins can see what the competitor actually charged and how much they served.

## What changes for the user

In the dish list inside `/admin/quote-creator`, every extracted dish will now show (when present on the source):
- Source quantity + unit (e.g. "50 ea", "2 trays", "10 lb")
- Source unit price and line total (e.g. "$12.50/ea · $625 total")
- Category / section header it came from (Appetizers, Mains, Sides, …)
- Free-form notes (e.g. "GF option", "served family-style")
- The original source row text, so we can verify the AI didn't misread it

These appear as small muted text under the dish name and are editable inline. Bulk delete and merge keep working unchanged.

## Technical changes

### 1. Database — extend `cqh_dishes`
Migration adds nullable columns (all optional, no breaking changes):
- `source_qty numeric`
- `source_unit text`
- `source_unit_price numeric`
- `source_line_total numeric`
- `source_category text` (e.g. "Appetizers")
- `source_notes text`
- `source_raw text` (the original row/line as seen in the document)

### 2. AI extractor — `extractDishesFromDocs` in `src/lib/server-fns/cqh.functions.ts`
Update `DISHES_SYSTEM` prompt + JSON schema to return these fields per dish, instructing the model to:
- Pull `qty`, `unit`, `unit_price`, `line_total`, `category`, `notes` whenever the source row contains them (very common in spreadsheets).
- Preserve the original row text in `raw`.
- Still skip true non-food rows (linens, gratuity, taxes).

Insert path maps the new fields into the new columns. Dedup logic stays name-based, but when merging duplicates across documents we keep the richest record (prefer the one with price/qty filled in).

### 3. Spreadsheet-aware extraction (quality boost)
In `src/lib/cqh/extract-text.ts`, when the file is `.xlsx/.xls/.csv/.tsv`, prepend a short header line (`# Source: spreadsheet — columns appear tabular, preserve qty/price columns when present`) so the model treats columns as structured data rather than prose. Text already comes through `XLSX.utils.sheet_to_csv`, so no parser change needed.

### 4. UI — `src/routes/admin/quote-creator.tsx`
In the dish list row, render a second muted line when any source_* field is present:
```
Grilled Salmon                                    [main]
  50 ea · $12.50/ea · $625 total · Mains · "GF option"
```
Inline edit dialog (existing) gets fields for qty/unit/unit_price/category/notes. `updateCqhDish` already takes a generic patch, so it accepts the new columns automatically once they exist.

### 5. Counter-quote builder
The downstream counter-quote/shopping-list flow currently only reads `name` + `is_main`, so it keeps working. The new fields are available for a future "match competitor pricing" feature but are not required for anything to keep functioning today.

## Files touched
- New migration: add the 7 columns to `cqh_dishes`.
- `src/lib/server-fns/cqh.functions.ts` — prompt + insert mapping + merge-prefer-richest.
- `src/lib/cqh/extract-text.ts` — prepend spreadsheet hint.
- `src/routes/admin/quote-creator.tsx` — render + edit new fields.
