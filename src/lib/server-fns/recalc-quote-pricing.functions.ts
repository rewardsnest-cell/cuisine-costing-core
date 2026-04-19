import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export const recalcQuotePricing = createServerFn({ method: "POST" })
  .inputValidator((data: { quoteId: string }) => {
    if (!data?.quoteId) throw new Error("quoteId is required");
    return data;
  })
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Server is missing Supabase credentials");
    const supabase = createClient(url, key);

    // 1. Read markup multiplier
    const { data: settings } = await supabase
      .from("app_settings")
      .select("markup_multiplier")
      .eq("id", 1)
      .maybeSingle();
    const markup = Number(settings?.markup_multiplier) || 3.0;

    // 2. Load quote items with their recipes
    const { data: items, error: itemsErr } = await supabase
      .from("quote_items")
      .select("id, quantity, recipe_id, unit_price, total_price")
      .eq("quote_id", data.quoteId);
    if (itemsErr) throw itemsErr;

    let updated = 0;
    for (const item of items ?? []) {
      if (!item.recipe_id) continue;
      // Refresh recipe cost from current reference data
      await supabase.rpc("recompute_recipe_cost", { _recipe_id: item.recipe_id });
      const { data: recipe } = await supabase
        .from("recipes")
        .select("cost_per_serving")
        .eq("id", item.recipe_id)
        .maybeSingle();
      const cps = Number(recipe?.cost_per_serving) || 0;
      const unit = Math.round(cps * markup * 100) / 100;
      const qty = Number(item.quantity) || 1;
      const total = Math.round(unit * qty * 100) / 100;
      const { error: upErr } = await supabase
        .from("quote_items")
        .update({ unit_price: unit, total_price: total })
        .eq("id", item.id);
      if (upErr) throw upErr;
      updated += 1;
    }

    // 3. Recompute subtotal/total on the quote — round per-guest UP to next $5
    const { data: refreshed } = await supabase
      .from("quote_items")
      .select("total_price")
      .eq("quote_id", data.quoteId);
    const rawSubtotal = (refreshed ?? []).reduce((s, r) => s + (Number(r.total_price) || 0), 0);

    const { data: quote } = await supabase
      .from("quotes")
      .select("tax_rate, guest_count")
      .eq("id", data.quoteId)
      .maybeSingle();
    const taxRate = Number(quote?.tax_rate) || 0;
    const guests = Math.max(Number(quote?.guest_count) || 1, 1);

    const rawPerGuest = rawSubtotal / guests;
    const roundedPerGuest = rawPerGuest > 0 ? Math.ceil(rawPerGuest / 5) * 5 : 0;
    const subtotal = Math.round(roundedPerGuest * guests * 100) / 100;
    const total = Math.round(subtotal * (1 + taxRate) * 100) / 100;

    const { error: qErr } = await supabase
      .from("quotes")
      .update({ subtotal, total })
      .eq("id", data.quoteId);
    if (qErr) throw qErr;

    return { updatedItems: updated, subtotal, total, markup, perGuest: roundedPerGuest };
  });
