-- Additive: track synonym origin (auto vs manual). Default 'manual' preserves existing semantics.
ALTER TABLE public.ingredient_synonyms
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Helpful index for unlinked-coverage queries
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_reference_id
  ON public.recipe_ingredients (reference_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_synonyms_alias_normalized
  ON public.ingredient_synonyms (alias_normalized);