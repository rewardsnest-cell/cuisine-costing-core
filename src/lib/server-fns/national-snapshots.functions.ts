import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SnapshotInput = {
  ingredient_id: string;
  price: number;
  unit: string;
  region?: string | null;
  month: string; // YYYY-MM
  source: string;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validateRow(r: any, idx: number): SnapshotInput {
  const where = `row ${idx + 1}`;
  if (!r || typeof r !== "object") throw new Error(`${where}: invalid row`);
  if (typeof r.ingredient_id !== "string" || !r.ingredient_id)
    throw new Error(`${where}: ingredient_id required`);
  const price = Number(r.price);
  if (!Number.isFinite(price) || price < 0) throw new Error(`${where}: price must be >= 0`);
  if (typeof r.unit !== "string" || !r.unit.trim()) throw new Error(`${where}: unit required`);
  if (typeof r.month !== "string" || !MONTH_RE.test(r.month))
    throw new Error(`${where}: month must be YYYY-MM`);
  if (typeof r.source !== "string" || !r.source.trim()) throw new Error(`${where}: source required`);
  return {
    ingredient_id: r.ingredient_id,
    price,
    unit: r.unit.trim(),
    region: r.region ? String(r.region).trim() : null,
    month: r.month,
    source: r.source.trim(),
  };
}

/**
 * Admin-only manual insert of monthly national price snapshots.
 * Append-only. Rows that already exist for (ingredient, region, month, source) are skipped.
 */
export const insertNationalSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rows: unknown[] }) => {
    if (!data || !Array.isArray(data.rows)) throw new Error("rows array required");
    if (data.rows.length === 0) throw new Error("rows is empty");
    if (data.rows.length > 5000) throw new Error("too many rows (max 5000 per call)");
    const rows = data.rows.map((r, i) => validateRow(r, i));
    return { rows };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    // Verify caller is admin (RLS will also block, but we want a clean error).
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data: roleRow } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Admin access required");

    let inserted = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const { error } = await sb.from("national_price_snapshots").insert({
        ingredient_id: r.ingredient_id,
        price: r.price,
        unit: r.unit,
        region: r.region,
        month: r.month,
        source: r.source,
      });
      if (error) {
        if (error.code === "23505") {
          skipped += 1; // unique violation = already have a snapshot for this slot
        } else {
          errors.push({ row: i + 1, message: error.message });
        }
      } else {
        inserted += 1;
      }
    }

    return { inserted, skipped, errors, total: data.rows.length };
  });
