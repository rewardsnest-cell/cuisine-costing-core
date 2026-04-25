import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Receipt × Kroger SKU diagnostic.
 *
 * For each receipt line item we report:
 *  - whether it was matched to an inventory item at all (and how)
 *  - whether that inventory item is linked to ingredient_reference
 *  - whether ingredient_reference has any kroger_sku_map rows
 *  - the SKU details (sku, product name, regular/promo price, observed_at, status, confidence)
 *  - if no SKU exists, the failure reason category so we can diagnose
 *
 * Read-only. Admin only.
 */

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

const InputSchema = z
  .object({
    receipt_limit: z.number().int().positive().max(100).optional(),
    only_unmatched: z.boolean().optional(),
    receipt_id: z.string().uuid().optional(),
  })
  .strict()
  .optional();

export type KrogerSkuRow = {
  id: string;
  sku: string;
  product_id: string | null;
  product_name: string | null;
  status: string;
  match_confidence: number | null;
  regular_price: number | null;
  promo_price: number | null;
  price_unit_size: string | null;
  price_observed_at: string | null;
  last_seen_at: string;
};

export type LineDiagnostic = {
  receipt_id: string;
  receipt_date: string | null;
  receipt_status: string;
  line_index: number;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  // Inventory match (from receipt extraction)
  matched_inventory_id: string | null;
  matched_inventory_name: string | null;
  match_score: number | null;
  match_source: string | null;
  // Ingredient reference link
  reference_id: string | null;
  reference_name: string | null;
  // Kroger SKU outcome
  kroger_status:
    | "matched"
    | "no_inventory_match"
    | "no_reference_link"
    | "no_kroger_skus"
    | "unmapped_only";
  kroger_reason: string;
  kroger_skus: KrogerSkuRow[];
  // Query parameters that would be used for a fresh Kroger lookup of this line
  kroger_query: {
    raw_term: string;
    cleaned_term: string;
    cleaned_length: number;
    will_send: boolean;
    skip_reason: string | null;
    location_id: string | null;
  };
};

function cleanKrogerTerm(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 128);
}

export const listReceiptKrogerDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d) ?? {})
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase, context.userId);

    const limit = Math.min(100, Math.max(1, data.receipt_limit ?? 10));

    // 1. Pull recent receipts (or one specific receipt)
    let q = supabaseAdmin
      .from("receipts")
      .select("id,receipt_date,status,extracted_line_items,created_at")
      .order("created_at", { ascending: false });
    if (data.receipt_id) {
      q = q.eq("id", data.receipt_id);
    } else {
      q = q.limit(limit);
    }
    const { data: receipts, error } = await q;
    if (error) throw new Error(error.message);

    // 2. Per pricing intent, no admin-pinned Kroger location exists.
    //    The diagnostics view shows raw matches; no per-store query is shaped here.
    const locationId: string | null = null;

    // 3. Collect every matched_inventory_id across all lines, batch-fetch
    //    ingredient_reference + kroger_sku_map.
    const inventoryIds = new Set<string>();
    for (const r of receipts ?? []) {
      const items = Array.isArray(r.extracted_line_items)
        ? (r.extracted_line_items as any[])
        : [];
      for (const it of items) {
        if (it?.matched_inventory_id) inventoryIds.add(String(it.matched_inventory_id));
      }
    }

    // inventory_id -> { reference_id, canonical_name }
    const refByInventory = new Map<string, { reference_id: string; canonical_name: string }>();
    if (inventoryIds.size > 0) {
      const { data: refs, error: refErr } = await supabaseAdmin
        .from("ingredient_reference")
        .select("id,canonical_name,inventory_item_id")
        .in("inventory_item_id", [...inventoryIds]);
      if (refErr) throw new Error(refErr.message);
      for (const ref of refs ?? []) {
        if (ref.inventory_item_id) {
          refByInventory.set(String(ref.inventory_item_id), {
            reference_id: String(ref.id),
            canonical_name: String(ref.canonical_name),
          });
        }
      }
    }

    // reference_id -> KrogerSkuRow[]
    const skusByReference = new Map<string, KrogerSkuRow[]>();
    const referenceIds = [...refByInventory.values()].map((r) => r.reference_id);
    if (referenceIds.length > 0) {
      const { data: skus, error: skuErr } = await supabaseAdmin
        .from("kroger_sku_map")
        .select(
          "id,reference_id,sku,product_id,product_name,status,match_confidence,regular_price,promo_price,price_unit_size,price_observed_at,last_seen_at",
        )
        .in("reference_id", referenceIds)
        .order("last_seen_at", { ascending: false });
      if (skuErr) throw new Error(skuErr.message);
      for (const s of skus ?? []) {
        const refId = String(s.reference_id);
        const arr = skusByReference.get(refId) ?? [];
        arr.push({
          id: String(s.id),
          sku: String(s.sku),
          product_id: s.product_id ?? null,
          product_name: s.product_name ?? null,
          status: String(s.status),
          match_confidence: s.match_confidence == null ? null : Number(s.match_confidence),
          regular_price: s.regular_price == null ? null : Number(s.regular_price),
          promo_price: s.promo_price == null ? null : Number(s.promo_price),
          price_unit_size: s.price_unit_size ?? null,
          price_observed_at: s.price_observed_at ?? null,
          last_seen_at: String(s.last_seen_at),
        });
        skusByReference.set(refId, arr);
      }
    }

    // 4. Build per-line diagnostics
    const out: LineDiagnostic[] = [];
    for (const r of receipts ?? []) {
      const items = Array.isArray(r.extracted_line_items)
        ? (r.extracted_line_items as any[])
        : [];
      items.forEach((it: any, idx: number) => {
        const itemName = String(it.item_name ?? "");
        const matchedInvId = it.matched_inventory_id ? String(it.matched_inventory_id) : null;
        const refLink = matchedInvId ? refByInventory.get(matchedInvId) ?? null : null;
        const skus = refLink ? skusByReference.get(refLink.reference_id) ?? [] : [];
        const confirmedSkus = skus.filter((s) => s.status === "confirmed");

        let kStatus: LineDiagnostic["kroger_status"];
        let kReason: string;
        if (!matchedInvId) {
          kStatus = "no_inventory_match";
          kReason = "Receipt line did not match any inventory item during extraction.";
        } else if (!refLink) {
          kStatus = "no_reference_link";
          kReason =
            "Inventory item has no row in ingredient_reference (cannot link to Kroger SKUs).";
        } else if (skus.length === 0) {
          kStatus = "no_kroger_skus";
          kReason =
            "ingredient_reference exists but no kroger_sku_map rows. Run a Kroger ingest for this item.";
        } else if (confirmedSkus.length === 0) {
          kStatus = "unmapped_only";
          kReason = `Found ${skus.length} candidate Kroger SKU(s) but none are confirmed. Review at /admin/kroger-sku-review.`;
        } else {
          kStatus = "matched";
          kReason = `${confirmedSkus.length} confirmed Kroger SKU(s).`;
        }

        // Build the actual query that would be sent to Kroger for this line name.
        const cleaned = cleanKrogerTerm(itemName);
        const willSend = cleaned.length >= 3;
        const skipReason = willSend
          ? null
          : `Cleaned term "${cleaned}" is ${cleaned.length} chars (< 3). Kroger requires 3-128 chars.`;

        const line: LineDiagnostic = {
          receipt_id: String(r.id),
          receipt_date: r.receipt_date ?? null,
          receipt_status: String(r.status),
          line_index: idx,
          item_name: itemName,
          quantity: Number(it.quantity ?? 0),
          unit: String(it.unit ?? ""),
          unit_price: Number(it.unit_price ?? 0),
          matched_inventory_id: matchedInvId,
          matched_inventory_name: it.matched_inventory_name ?? null,
          match_score: it.match_score == null ? null : Number(it.match_score),
          match_source: it.match_source ?? null,
          reference_id: refLink?.reference_id ?? null,
          reference_name: refLink?.canonical_name ?? null,
          kroger_status: kStatus,
          kroger_reason: kReason,
          kroger_skus: skus,
          kroger_query: {
            raw_term: itemName,
            cleaned_term: cleaned,
            cleaned_length: cleaned.length,
            will_send: willSend,
            skip_reason: skipReason,
            location_id: locationId,
          },
        };

        if (data.only_unmatched && line.kroger_status === "matched") return;
        out.push(line);
      });
    }

    return {
      lines: out,
      location_id: locationId,
      receipts_scanned: (receipts ?? []).length,
    };
  });
