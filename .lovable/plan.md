# AI Recipe Creation System (Admin Only)

A new admin page that turns prompts, ingredient lists, images, videos, or copycat inspiration into complete, editable recipe drafts using AI.

## Location & Access
- Route: `/admin/recipes/ai-create` (admin gate via existing `useAuth().isAdmin` pattern)
- Nav: under **Menu & Content** in `src/routes/admin.tsx`, labeled **Create Recipe (AI)**

## Database Changes
Migration adds the missing fields to `recipes`:
- `seo_title text`, `seo_description text`, `feed_summary text`
- `tone text` (preset used)
- `ai_generated boolean default false`
- `ai_inputs jsonb` (raw inputs used: prompt/dish/ingredients/image refs/video URL/copycat)
- `ai_generation_meta jsonb` (model, tokens, timestamps, admin id, regen history)

New table `recipe_tool_suggestions`:
- `id, recipe_id, name, reason, status (suggested|added|dismissed), affiliate_url, created_at`
- RLS: admin-only read/write via existing `has_role(auth.uid(),'admin')`

New storage bucket `recipe-ai-uploads` (private) for admin reference image/video uploads. RLS: admin-only.

## Server Functions (TanStack `createServerFn`)
File: `src/lib/server-fns/ai-recipe-create.functions.ts` — all gated with `requireSupabaseAuth` + admin check (matching `access-control.functions.ts` pattern).

1. **`generateRecipe`** — input: `{ promptText?, dishName?, ingredientsList?, imageUrls?: string[], videoUrl?, copycatNotes?, tone, category? }`. Calls Lovable AI Gateway (`google/gemini-2.5-pro` for multimodal, `google/gemini-3-flash-preview` text-only) using **tool calling for structured output**: returns `{ title, category, ingredients[], steps[], notes{substitutions, storage, reheating}, seo_title, seo_description, feed_summary, suggested_tools[] }`. System prompt enforces the chef persona, safety, and no-trademark rules.
2. **`generateRecipeImage`** — wraps existing `generate-recipe-photos.ts` pattern with the AI-create system's neutral-bg prompt; uploads to `recipe-photos` bucket.
3. **`regenerateSection`** — input: `{ draftId, section: 'title'|'ingredients'|'steps'|'notes'|'seo'|'feed'|'tools', tone? }`. Regenerates only that field.
4. **`bulkGenerateRecipes`** — input: `{ count(1-10), variationType: 'flavor'|'protein'|'method', baseInputs, category, tone }`. Loops `generateRecipe` and creates N drafts.
5. **`saveDraft`** / **`publishRecipe`** — writes to `recipes` (status='draft'|'published') + `recipe_ingredients`. Publish validates title, ingredients, instructions, image_url present.
6. **`updateToolSuggestion`** — add affiliate URL or dismiss.

All write operations use `supabaseAdmin` and log generation meta (admin user id, timestamp, tone, inputs).

## Frontend Page
`src/routes/admin/recipes.ai-create.tsx` — single-page workflow with two columns:

**Left column — Inputs**
- Tabs / accordion for input sources: Free text, Dish name, Ingredients (textarea, one per line), Image upload (multi, to `recipe-ai-uploads`), Video URL, Copycat inspiration (with flavor notes field)
- **Tone** select: Friendly & Casual / Confident & Bold / Cozy & Comforting / Straightforward & Practical / Viral / Feed-Optimized
- **Bulk Mode** toggle → reveals count (1–10), variation type, category
- Action buttons: `Generate Recipe`, `Generate Bulk Drafts`

**Right column — Draft Editor** (appears after generation)
- Editable fields for: Title, Category select, Ingredients table (`name | qty | unit`, add/remove rows), Numbered Steps (sortable list), Notes (substitutions / storage / reheating), SEO Title, SEO Description (160-char counter), Feed Summary
- Image panel: shows generated image with `Regenerate Image` and `Upload Custom` buttons
- Per-section `Regenerate` buttons (calls `regenerateSection`)
- Tone selector here too — change + regenerate text-only outputs
- Sidebar card: **Suggested tools for this recipe** with `Add affiliate link` (input modal) and `Dismiss` per item
- Footer actions: `Save Draft`, `Publish Recipe` (disabled until required fields met)

**Bulk Mode view**
- After bulk generation, shows a list of N draft cards; click one to open the editor view above

## AI Prompt Strategy
System prompt (server-side only, never client) establishes:
- Persona: professional home chef + recipe developer + food content designer
- Rules: home-kitchen friendly, plain language, no jargon, no trademarks, no unsafe instructions, one action per step with timing cues
- Tone modifier appended based on selected preset
- Output format enforced via OpenAI tool-call JSON schema (matches DB shape)

For multimodal inputs (images/video URL), sent as `image_url` content parts in the user message to `google/gemini-2.5-pro`.

## Security & Compliance
- Admin role check on every server fn (defense in depth alongside RLS)
- All AI calls server-side; `LOVABLE_API_KEY` already configured
- Affiliate links are never auto-added — admin must explicitly add per suggestion
- Uploaded reference media stored in private bucket; only generated finished image goes to public `recipe-photos` bucket

## Files to Create
- `supabase/migrations/<timestamp>_ai_recipe_create.sql` — columns, table, bucket, RLS
- `src/lib/server-fns/ai-recipe-create.functions.ts`
- `src/routes/admin/recipes.ai-create.tsx`
- `src/components/admin/ai-recipe/InputPanel.tsx`
- `src/components/admin/ai-recipe/DraftEditor.tsx`
- `src/components/admin/ai-recipe/ToolSuggestions.tsx`
- `src/components/admin/ai-recipe/BulkResults.tsx`

## Files to Edit
- `src/routes/admin.tsx` — add nav link under Menu & Content

## Out of Scope (Phase 2)
- Server-side video transcription (Phase 1 sends URL + admin-provided notes; AI uses URL as reference only)
- Auto-publishing to social feeds
