// Fuzzy ingredient matching helpers shared between server functions and public API routes.

import { normalizeUnit } from "@/lib/server/pricing-engine/units";

const STOP = new Set([
  "fresh", "raw", "whole", "large", "small", "medium", "organic", "the", "a", "an",
]);

export function normalizeForMatch(s: string): string {
  let t = (s ?? "").toLowerCase().trim();
  t = t.replace(/\([^)]*\)/g, " ");
  t = t.replace(/[^a-z0-9\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  t = t
    .split(" ")
    .map((w) => {
      if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
      if (w.length > 3 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
      if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
      return w;
    })
    .join(" ");
  t = t.split(" ").filter((w) => !STOP.has(w)).join(" ");
  return t.trim();
}

export function tokenJaccard(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0: number[] = new Array(b.length + 1);
  const v1: number[] = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  const lev = 1 - levenshtein(a, b) / maxLen;
  const jac = tokenJaccard(a, b);
  return 0.55 * lev + 0.45 * jac;
}

// ---- Multi-field similarity (name + unit + category) ----

export type DimGroup = "weight" | "volume" | "count" | "unknown";

const WEIGHT = new Set(["lb","lbs","pound","pounds","oz","ounce","ounces","g","gram","grams","kg","kilogram","kilograms","stick"]);
const VOLUME = new Set(["fl oz","floz","fluid ounce","fluid ounces","cup","cups","c","tbsp","tablespoon","tablespoons","tsp","teaspoon","teaspoons","pt","pint","pints","qt","quart","quarts","gal","gallon","gallons","ml","milliliter","milliliters","l","liter","liters","litre","pinch","dash"]);
const COUNT  = new Set(["each","ea","piece","pieces","whole","unit","units","clove","cloves","slice","slices","head","heads","bunch","bunches","sprig","sprigs"]);

export function unitDimension(u: string | null | undefined): DimGroup {
  const n = normalizeUnit(u ?? "");
  if (!n) return "unknown";
  if (WEIGHT.has(n)) return "weight";
  if (VOLUME.has(n)) return "volume";
  if (COUNT.has(n)) return "count";
  return "unknown";
}

export type Candidate = {
  /** Stable identifier (uuid, sku, row index, etc.). */
  id: string;
  /** Display / canonical name. */
  name: string;
  /** Optional unit or base_unit. */
  unit?: string | null;
  /** Optional category (e.g. "produce", "dairy"). */
  category?: string | null;
};

export type ScoredEdge = {
  a_id: string;
  b_id: string;
  name_score: number;
  unit_match: boolean | null;
  category_match: boolean | null;
  confidence: number;
};

/**
 * Combine name similarity with unit/category bonuses & penalties.
 * Returns a confidence in [0, 1].
 */
export function combinedConfidence(opts: {
  nameScore: number;
  aUnit?: string | null;
  bUnit?: string | null;
  aCategory?: string | null;
  bCategory?: string | null;
}): { confidence: number; unit_match: boolean | null; category_match: boolean | null } {
  const { nameScore } = opts;
  let unitMatch: boolean | null = null;
  let catMatch: boolean | null = null;
  let bonus = 0;

  if (opts.aUnit != null && opts.bUnit != null && opts.aUnit !== "" && opts.bUnit !== "") {
    const da = unitDimension(opts.aUnit);
    const db = unitDimension(opts.bUnit);
    if (da !== "unknown" && db !== "unknown") {
      if (da === db) {
        unitMatch = true;
        bonus += 0.05;
      } else {
        unitMatch = false;
        bonus -= 0.25; // hard penalty: different dimensions almost never duplicates
      }
    }
  }

  if (opts.aCategory != null && opts.bCategory != null) {
    const a = opts.aCategory.trim().toLowerCase();
    const b = opts.bCategory.trim().toLowerCase();
    if (a && b) {
      if (a === b) { catMatch = true; bonus += 0.05; }
      else { catMatch = false; bonus -= 0.10; }
    }
  }

  const confidence = Math.max(0, Math.min(1, nameScore + bonus));
  return { confidence, unit_match: unitMatch, category_match: catMatch };
}

// ---- Union-Find clustering ----

export class UF {
  private parent: Map<string, string> = new Map();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = this.parent.get(x)!;
    while (r !== this.parent.get(r)!) r = this.parent.get(r)!;
    this.parent.set(x, r);
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export type DuplicateGroup = {
  group_id: string;
  canonical: { id: string; name: string; unit?: string | null; category?: string | null };
  members: Array<{
    id: string;
    name: string;
    unit?: string | null;
    category?: string | null;
    score: number;          // confidence vs canonical
    name_score: number;     // pure name similarity vs canonical
  }>;
  /** Lowest pairwise confidence inside the group (worst-case). */
  confidence: number;
  size: number;
};

/**
 * Cluster a list of candidates into duplicate groups.
 *
 * @param candidates input rows
 * @param opts.minConfidence minimum confidence to include a group in the output (default 0.7)
 * @param opts.linkThreshold minimum pairwise confidence to link two rows together (default 0.7)
 */
export function findDuplicateGroups(
  candidates: Candidate[],
  opts: { minConfidence?: number; linkThreshold?: number } = {},
): { groups: DuplicateGroup[]; edges: ScoredEdge[]; scanned: number } {
  const minConfidence = opts.minConfidence ?? 0.7;
  const linkThreshold = opts.linkThreshold ?? 0.7;

  const norm = candidates.map((c) => ({ ...c, n: normalizeForMatch(c.name) }));
  const uf = new UF();
  const edges: ScoredEdge[] = [];
  const edgeByPair = new Map<string, ScoredEdge>();

  // O(n²) pairwise; fine for n ≤ ~2k. Bucket by first letter to prune cheaply.
  const buckets = new Map<string, typeof norm>();
  for (const item of norm) {
    const key = item.n.charAt(0) || "_";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }

  // To catch cross-bucket dupes (e.g. "tomato" vs " tomato"), also do a coarser pass over all.
  const allItems = norm;
  for (let i = 0; i < allItems.length; i++) {
    const a = allItems[i];
    if (!a.n) continue;
    for (let j = i + 1; j < allItems.length; j++) {
      const b = allItems[j];
      if (!b.n) continue;
      // Cheap prefix prune: if first 2 chars don't overlap & lengths differ a lot, skip.
      if (Math.abs(a.n.length - b.n.length) > 6 && a.n.slice(0, 2) !== b.n.slice(0, 2)) continue;

      const nameScore = nameSimilarity(a.n, b.n);
      if (nameScore < linkThreshold - 0.15) continue; // early bail

      const { confidence, unit_match, category_match } = combinedConfidence({
        nameScore,
        aUnit: a.unit, bUnit: b.unit,
        aCategory: a.category, bCategory: b.category,
      });

      if (confidence < linkThreshold) continue;

      const edge: ScoredEdge = {
        a_id: a.id,
        b_id: b.id,
        name_score: round(nameScore),
        unit_match,
        category_match,
        confidence: round(confidence),
      };
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      edgeByPair.set(key, edge);
      edges.push(edge);
      uf.union(a.id, b.id);
    }
  }

  // Build groups
  const byRoot = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const root = uf.find(c.id);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root)!.push(c);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, members] of byRoot.entries()) {
    if (members.length < 2) continue;

    // Pick canonical: shortest normalized name (likely the "cleanest" base form).
    const sorted = [...members].sort((a, b) => {
      const an = normalizeForMatch(a.name).length;
      const bn = normalizeForMatch(b.name).length;
      if (an !== bn) return an - bn;
      return a.name.length - b.name.length;
    });
    const canonical = sorted[0];

    // Score every member vs canonical
    const cn = normalizeForMatch(canonical.name);
    const scored = members.map((m) => {
      if (m.id === canonical.id) {
        return { id: m.id, name: m.name, unit: m.unit ?? null, category: m.category ?? null, score: 1, name_score: 1 };
      }
      const mn = normalizeForMatch(m.name);
      const ns = nameSimilarity(cn, mn);
      const cc = combinedConfidence({
        nameScore: ns,
        aUnit: canonical.unit, bUnit: m.unit,
        aCategory: canonical.category, bCategory: m.category,
      });
      return {
        id: m.id, name: m.name, unit: m.unit ?? null, category: m.category ?? null,
        score: round(cc.confidence), name_score: round(ns),
      };
    });

    // Group confidence = lowest pairwise edge confidence inside the cluster.
    let groupConf = 1;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j];
        const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const e = edgeByPair.get(k);
        if (e) groupConf = Math.min(groupConf, e.confidence);
      }
    }

    if (groupConf < minConfidence) continue;

    groups.push({
      group_id: root,
      canonical: { id: canonical.id, name: canonical.name, unit: canonical.unit ?? null, category: canonical.category ?? null },
      members: scored.sort((a, b) => b.score - a.score),
      confidence: round(groupConf),
      size: members.length,
    });
  }

  groups.sort((a, b) => b.confidence - a.confidence || b.size - a.size);
  return { groups, edges, scanned: candidates.length };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
