import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Deterministic volatility detection (admin notification only — no actions).
 * Triggers:
 *  - Local average price deviates ±20% from current national snapshot
 *  - Month-over-month national snapshot changes ≥ 15%
 */
const LOCAL_DEV_THRESHOLD = 0.2;
const MOM_THRESHOLD = 0.15;
const LOCAL_WINDOW_DAYS = 45;

export const getPriceVolatilityAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: kv } = await sb
      .from("app_kv")
      .select("value")
      .eq("key", "active_national_price_month")
      .maybeSingle();
    const activeMonth: string | null = kv?.value ?? null;

    const { data: refs } = await sb
      .from("ingredient_reference")
      .select("id, canonical_name, inventory_item_id")
      .limit(1000);

    const refMap = new Map<string, { name: string; inv: string | null }>();
    for (const r of refs ?? []) {
      refMap.set(r.id, { name: r.canonical_name, inv: r.inventory_item_id });
    }
    const ids = Array.from(refMap.keys());
    if (ids.length === 0) return { alerts: [] };

    // National: latest 2 months per ingredient
    const { data: snaps } = await sb
      .from("national_price_snapshots")
      .select("ingredient_id, month, price, unit")
      .in("ingredient_id", ids)
      .order("month", { ascending: false });

    const latestByRef = new Map<string, { price: number; unit: string; month: string }>();
    const prevByRef = new Map<string, { price: number; month: string }>();
    for (const s of snaps ?? []) {
      const cur = latestByRef.get(s.ingredient_id);
      if (!cur) {
        latestByRef.set(s.ingredient_id, {
          price: Number(s.price),
          unit: s.unit,
          month: s.month,
        });
      } else if (!prevByRef.get(s.ingredient_id) && s.month !== cur.month) {
        prevByRef.set(s.ingredient_id, { price: Number(s.price), month: s.month });
      }
    }

    // Local averages from price_history (rolling 45 days)
    const sinceIso = new Date(Date.now() - LOCAL_WINDOW_DAYS * 86400000).toISOString();
    const invIds = Array.from(refMap.values())
      .map((m) => m.inv)
      .filter((x): x is string => !!x);

    const localAvgByInv = new Map<string, number>();
    if (invIds.length) {
      const { data: ph } = await sb
        .from("price_history")
        .select("inventory_item_id, unit_price, observed_at")
        .in("inventory_item_id", invIds)
        .gte("observed_at", sinceIso);
      const acc = new Map<string, { sum: number; n: number }>();
      for (const r of ph ?? []) {
        const cur = acc.get(r.inventory_item_id) || { sum: 0, n: 0 };
        cur.sum += Number(r.unit_price) || 0;
        cur.n += 1;
        acc.set(r.inventory_item_id, cur);
      }
      for (const [k, v] of acc) {
        if (v.n > 0) localAvgByInv.set(k, v.sum / v.n);
      }
    }

    type Alert = {
      ingredient_id: string;
      name: string;
      kind: "local_deviation" | "national_mom";
      details: string;
      severity: "warn" | "high";
    };
    const alerts: Alert[] = [];

    for (const [refId, meta] of refMap) {
      const latest = latestByRef.get(refId);
      const prev = prevByRef.get(refId);
      if (latest && prev && prev.price > 0) {
        const change = (latest.price - prev.price) / prev.price;
        if (Math.abs(change) >= MOM_THRESHOLD) {
          alerts.push({
            ingredient_id: refId,
            name: meta.name,
            kind: "national_mom",
            details: `${prev.month} $${prev.price.toFixed(2)} → ${latest.month} $${latest.price.toFixed(2)} (${(change * 100).toFixed(1)}%)`,
            severity: Math.abs(change) >= 0.3 ? "high" : "warn",
          });
        }
      }
      if (latest && meta.inv) {
        const local = localAvgByInv.get(meta.inv);
        if (local && local > 0) {
          const dev = (local - latest.price) / latest.price;
          if (Math.abs(dev) >= LOCAL_DEV_THRESHOLD) {
            alerts.push({
              ingredient_id: refId,
              name: meta.name,
              kind: "local_deviation",
              details: `Local avg $${local.toFixed(2)} vs national $${latest.price.toFixed(2)} (${(dev * 100).toFixed(1)}%)`,
              severity: Math.abs(dev) >= 0.4 ? "high" : "warn",
            });
          }
        }
      }
    }

    return { activeMonth, alerts: alerts.slice(0, 200) };
  });
