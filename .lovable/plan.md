

The user wants to import the recipes (typo: "residues" → "recipes") from vpsfinest.com into the system's `recipes` table.

## Plan

### 1. Scrape recipes from vpsfinest.com
Use Firecrawl (already-available connector) server-side to:
- **Map** `https://www.vpsfinest.com` to discover all recipe URLs (filter for `/recipes/*` or similar paths).
- **Batch scrape** each recipe page as markdown + structured JSON, asking the model to extract: `name`, `description`, `category`, `cuisine`, `prep_time`, `cook_time`, `servings`, `instructions`, `image_url`, `allergens`, `is_vegan`, `is_vegetarian`, `is_gluten_free`, and an `ingredients` array (`name`, `quantity`, `unit`).

### 2. Build an admin import page
New route `src/routes/admin/import-recipes.tsx`:
- "Scan vpsfinest.com" button → calls a server function that runs the Firecrawl map + scrape and returns a preview list (no DB writes yet).
- Preview table showing each found recipe with checkboxes, editable name, and detected ingredient count.
- "Import selected" button → inserts into `recipes` + `recipe_ingredients` (skipping duplicates by name match), then recomputes `total_cost` / `cost_per_serving` via the existing `recipe-costing.ts` helper where ingredients link to inventory.

### 3. Server function
`src/lib/server/import-vpsfinest-recipes.ts` exposes two `createServerFn` endpoints:
- `scanRecipes()` — Firecrawl map + scrape, returns parsed array. Read-only, no DB writes.
- `importRecipes(selected[])` — inserts into Supabase using the service role client (`client.server.ts`).

### 4. Connector setup
Firecrawl connector must be linked to this project before the server function works. The first run will prompt to connect.

### Out of scope (ask if needed)
- Image hosting: I'll store the original vpsfinest.com image URLs in `recipes.image_url`. If you want them re-uploaded to your storage bucket, say so.
- Inventory linking: ingredients will be created as free-text on `recipe_ingredients.name`. Linking to existing `inventory_items` will need a separate review pass (the existing `UnlinkedIngredientsReview` component already handles this).
- Re-import / sync: this is a one-shot importer. Re-running will skip recipes whose name already exists.

### Technical notes
- Route uses TanStack file-based routing (`admin.import-recipes.tsx`).
- Firecrawl called via the Lovable connector gateway (`https://connector-gateway.lovable.dev/firecrawl/...`) from a server function — never client-side.
- Inserts respect existing RLS (admin auth required, already enforced by the `/admin` layout).

