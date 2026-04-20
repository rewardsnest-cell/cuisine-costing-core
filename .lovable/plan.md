
User wants a "Generate all missing images with AI" action — a one-click bulk generator for every recipe lacking `image_url`, scoped to the merged Recipe Hub list.

Combining with the prior approved plan (merge `/admin/recipes` into `/admin/recipe-hub`):

## Plan

### 1. Merge `/admin/recipes` → `/admin/recipe-hub` (as previously planned)
- Hub list absorbs operational filters (Active/Off, Food/Cocktail), "Recompute all costs" button, cost column.
- `/admin/recipe-hub/$id` becomes tabbed: "Content & Monetization" (default) + "Recipe & Cost" (embeds `RecipeForm`).
- Redirects: `/admin/recipes` → `/admin/recipe-hub`; `/admin/recipes/$id/edit` → `/admin/recipe-hub/$id?tab=recipe`.
- Sidebar: remove "All Recipes", rename "Recipe Hub" → "Recipes".

### 2. New "Generate all missing images" action
- **Header button** on `/admin/recipe-hub` next to "New recipe": **"Generate missing photos (N)"** where N = count of recipes with no `image_url` across the *entire* list (not just visible/selected).
- Disabled when N = 0. Confirmation dialog before running ("This will use AI credits and may take ~Ns").
- Progress bar showing `done / total · X failed`, cancellable.
- Reuses existing `generateRecipePhoto` server fn from `src/lib/server/generate-recipe-photos.ts` — sequential calls (1 at a time) to respect AI gateway rate limits, 500ms delay between calls.
- On each success: update row's `image_url` in local state so the thumbnail appears live.
- Toast summary at end: "Generated X photos, Y failed".
- Also add a smaller **"Social photos (M)"** secondary action using existing `generateRecipeSocialPhoto` for recipes missing `social_image_url` (only if the column is shown / opt-in via filter).

### 3. Filter chip
- Add "Missing photo" to existing filter chips so users can preview which recipes will be processed.

### Files touched
- **Modify**: `src/routes/admin/recipe-hub.tsx` (merge features + new bulk-generate header action + filter), `src/routes/admin/recipe-hub.$id.tsx` (tabs + embed RecipeForm), `src/routes/admin.tsx` (sidebar), `src/lib/admin/project-audit.ts` (path rename).
- **Convert to redirects**: `src/routes/admin/recipes.tsx`, `src/routes/admin/recipes.$id.edit.tsx`.
- **Reuse as-is**: `generateRecipePhoto`, `generateRecipeSocialPhoto`, `RecipeForm`, `RecipeBulkActions`.

### Risks & mitigations
| Risk | Mitigation |
|---|---|
| AI rate limits (429) on large batches | Sequential calls + 500ms delay; surface failed count, allow re-run (will skip already-photoed) |
| Long-running batch if 50+ recipes | Live progress + cancel button; user can stop anytime |
| Cost surprise | Confirmation dialog states count + that AI credits are consumed |
| Partial completion crash | Each recipe is independent; failures captured per-row, not fatal |

### Out of scope
- No DB changes. No new server function (existing `generateRecipePhoto` already handles single recipe). No parallel/queue infrastructure.
