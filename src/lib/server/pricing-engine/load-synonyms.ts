import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { registerUnitSynonyms } from "@/lib/server/pricing-engine/units";

let lastLoaded = 0;
const TTL_MS = 30_000;

/**
 * Hydrates the in-memory unit synonym registry from pe_unit_synonyms.
 * Cached for 30s to avoid hammering the DB on hot paths.
 */
export async function ensureUnitSynonymsLoaded(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastLoaded < TTL_MS) return;
  const { data, error } = await supabaseAdmin
    .from("pe_unit_synonyms")
    .select("synonym, canonical, dimension, factor");
  if (error) {
    console.warn("[unit-synonyms] load failed:", error.message);
    return;
  }
  registerUnitSynonyms(data ?? []);
  lastLoaded = now;
}
