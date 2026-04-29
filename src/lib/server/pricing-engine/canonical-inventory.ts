// Deterministic selection (and consolidation) of the canonical
// inventory_item_id when multiple ingredient_reference rows on the same
// ingredient point at different inventory items.
//
// Used during ingredient merges so every recipe_ingredient / reference / price
// row converges on ONE stable inventory item, with the others either
// consolidated into it or unlinked safely.

import type { SupabaseClient } from "@supabase/supabase-js";

export type InventoryCandidate = {
  id: string;
  name: string;
  catalog_status: string | null;
  pending_review: boolean | null;
  kroger_product_id: string | null;
  last_approved_cost_per_gram: number | null;
  cost_per_gram_live: number | null;
  average_cost_per_unit: number | null;
  current_stock: number | null;
  pricing_status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CanonicalInventoryPick = {
  canonical_id: string | null;
  candidates: Array<{
    id: string;
    name: string;
    score: number;
    recipe_links: number;
    reasons: string[];
  }>;
  /** Inventory ids that should be merged INTO the canonical (excludes canonical). */
  losing_ids: string[];
};

/**
 * Score every candidate inventory item using a deterministic, fully
 * tie-broken ranking. Higher score wins. Final tiebreak is the lexicographic
 * uuid so two identical inputs always pick the same winner across runs.
 *
 * Scoring rubric (all signals additive):
 *   +500  catalog_status === 'mapped'
 *   +200  has kroger_product_id (i.e. live-priceable)
 *   +120  has any approved/live cost-per-gram
 *   +100  pricing_status === 'OK'
 *    -80  pending_review === true
 *    -50  catalog_status === 'rejected'
 *    +N   recipe_links * 10  (most-used wins)
 *    +N   has stock → +25
 *    +N   age bonus: oldest created_at wins (older = more established)
 *           normalized to 0..40
 *   tiebreak: lower uuid wins
 */
export function scoreInventoryCandidate(
  c: InventoryCandidate,
  recipeLinks: number,
  oldestEpochMs: number,
  newestEpochMs: number,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (c.catalog_status === "mapped") { score += 500; reasons.push("mapped"); }
  else if (c.catalog_status === "rejected") { score -= 50; reasons.push("rejected"); }

  if (c.kroger_product_id) { score += 200; reasons.push("kroger-mapped"); }

  const hasCost =
    (c.last_approved_cost_per_gram != null && Number(c.last_approved_cost_per_gram) > 0) ||
    (c.cost_per_gram_live != null && Number(c.cost_per_gram_live) > 0) ||
    (c.average_cost_per_unit != null && Number(c.average_cost_per_unit) > 0);
  if (hasCost) { score += 120; reasons.push("has-cost"); }

  if (c.pricing_status === "OK") { score += 100; reasons.push("pricing-ok"); }

  if (c.pending_review) { score -= 80; reasons.push("pending-review"); }

  if (recipeLinks > 0) {
    score += recipeLinks * 10;
    reasons.push(`${recipeLinks} recipe link${recipeLinks === 1 ? "" : "s"}`);
  }

  if (c.current_stock != null && Number(c.current_stock) > 0) {
    score += 25;
    reasons.push("in-stock");
  }

  // Age bonus: oldest item wins (more historical weight). Normalized to 0..40.
  if (c.created_at && newestEpochMs > oldestEpochMs) {
    const t = new Date(c.created_at).getTime();
    const norm = 1 - (t - oldestEpochMs) / (newestEpochMs - oldestEpochMs);
    const ageBonus = Math.round(norm * 40);
    if (ageBonus > 0) {
      score += ageBonus;
      reasons.push(`age+${ageBonus}`);
    }
  }

  return { score, reasons };
}

/**
 * Pick the deterministic canonical inventory id from a set of candidates.
 *
 * @param sb        Supabase admin client (service role).
 * @param invIds    Distinct inventory_item_ids referenced by the ingredient.
 * @param hint      Optional preferred id (e.g. user override) — wins ties.
 */
export async function pickCanonicalInventoryId(
  sb: SupabaseClient,
  invIds: string[],
  hint?: string | null,
): Promise<CanonicalInventoryPick> {
  const unique = Array.from(new Set(invIds.filter((x): x is string => !!x)));
  if (unique.length === 0) {
    return { canonical_id: null, candidates: [], losing_ids: [] };
  }
  if (unique.length === 1) {
    return { canonical_id: unique[0], candidates: [{ id: unique[0], name: "", score: 0, recipe_links: 0, reasons: ["only-candidate"] }], losing_ids: [] };
  }

  // Pull metadata + recipe-link counts in parallel.
  const [{ data: items, error: itemErr }, { data: links }] = await Promise.all([
    sb
      .from("inventory_items")
      .select(
        "id, name, catalog_status, pending_review, kroger_product_id, last_approved_cost_per_gram, cost_per_gram_live, average_cost_per_unit, current_stock, pricing_status, created_at, updated_at",
      )
      .in("id", unique),
    sb
      .from("recipe_ingredients")
      .select("inventory_item_id")
      .in("inventory_item_id", unique),
  ]);
  if (itemErr) throw new Error(`pickCanonicalInventoryId: ${itemErr.message}`);

  const linkCounts = new Map<string, number>();
  for (const r of links ?? []) {
    const k = (r as any).inventory_item_id as string | null;
    if (!k) continue;
    linkCounts.set(k, (linkCounts.get(k) ?? 0) + 1);
  }

  const rows = (items ?? []) as InventoryCandidate[];
  if (rows.length === 0) return { canonical_id: null, candidates: [], losing_ids: [] };

  const epochs = rows
    .map((r) => (r.created_at ? new Date(r.created_at).getTime() : Date.now()));
  const oldest = Math.min(...epochs);
  const newest = Math.max(...epochs);

  const scored = rows.map((r) => {
    const links = linkCounts.get(r.id) ?? 0;
    const { score, reasons } = scoreInventoryCandidate(r, links, oldest, newest);
    return { id: r.id, name: r.name, score, recipe_links: links, reasons };
  });

  // Sort: score desc → recipe_links desc → uuid asc (stable, deterministic).
  // If a hint is supplied and present, it wins all ties at its score.
  scored.sort((a, b) => {
    if (a.id === hint && b.id !== hint && a.score === b.score) return -1;
    if (b.id === hint && a.id !== hint && a.score === b.score) return 1;
    if (b.score !== a.score) return b.score - a.score;
    if (b.recipe_links !== a.recipe_links) return b.recipe_links - a.recipe_links;
    return a.id < b.id ? -1 : 1;
  });

  const canonical = scored[0];
  return {
    canonical_id: canonical.id,
    candidates: scored,
    losing_ids: scored.slice(1).map((c) => c.id),
  };
}

/**
 * Re-point every recipe_ingredient + ingredient_reference row from any losing
 * inventory id onto the canonical id, then null-out the losing inventory_item
 * rows' references and (optionally) merge a few safe metadata fields.
 *
 * Returns counts so the caller can surface them in toast/audit output.
 */
export async function consolidateInventoryItems(
  sb: SupabaseClient,
  canonicalId: string,
  losingIds: string[],
): Promise<{
  recipe_links_repointed: number;
  references_repointed: number;
  inventory_items_consolidated: number;
  affected_recipe_ids: string[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const affectedRecipes = new Set<string>();
  let recipe_links_repointed = 0;
  let references_repointed = 0;
  let inventory_items_consolidated = 0;

  const ids = losingIds.filter((x) => x && x !== canonicalId);
  if (ids.length === 0) {
    return {
      recipe_links_repointed: 0,
      references_repointed: 0,
      inventory_items_consolidated: 0,
      affected_recipe_ids: [],
      warnings,
    };
  }

  // Capture affected recipes before re-pointing.
  const { data: pre } = await sb
    .from("recipe_ingredients")
    .select("recipe_id")
    .in("inventory_item_id", ids);
  for (const r of pre ?? []) {
    if ((r as any).recipe_id) affectedRecipes.add((r as any).recipe_id as string);
  }

  // Re-point recipe_ingredients onto the canonical inventory item.
  const { error: riErr, count: riCount } = await sb
    .from("recipe_ingredients")
    .update({ inventory_item_id: canonicalId }, { count: "exact" })
    .in("inventory_item_id", ids);
  if (riErr) warnings.push(`recipe_ingredients re-point: ${riErr.message}`);
  else if (riCount) recipe_links_repointed += riCount;

  // Re-point ingredient_reference rows that still pointed at the losing item.
  // (The merge handler updates by-name elsewhere; this catches any straggler
  // refs that linked by inventory_item_id but normalized to a different name.)
  const { error: refErr, count: refCount } = await sb
    .from("ingredient_reference")
    .update({ inventory_item_id: canonicalId }, { count: "exact" })
    .in("inventory_item_id", ids);
  if (refErr) warnings.push(`ingredient_reference re-point: ${refErr.message}`);
  else if (refCount) references_repointed += refCount;

  // Park the losing inventory_items as cost-equivalents of the canonical so we
  // don't lose history but every cost lookup resolves to the canonical row.
  // We keep the rows (don't delete) to preserve historical receipts / FKs.
  const { error: equivErr } = await sb
    .from("inventory_items")
    .update({
      cost_equivalent_of: canonicalId,
      pending_review: false,
      catalog_status: "merged",
      catalog_notes: `Merged into ${canonicalId} via duplicate cleanup`,
    })
    .in("id", ids);
  if (equivErr) warnings.push(`inventory_items consolidate: ${equivErr.message}`);
  else inventory_items_consolidated += ids.length;

  return {
    recipe_links_repointed,
    references_repointed,
    inventory_items_consolidated,
    affected_recipe_ids: Array.from(affectedRecipes),
    warnings,
  };
}
