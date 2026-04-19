import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Reports on Flipp-driven activity:
 *  - links generated (from access_audit_log action='flipp.link_generated')
 *  - quotes whose conversation/notes carry utm_source=flipp
 *  - sale_flyer_items currently flagged with a flipp_short_link
 */
export const getFlippAttribution = createServerFn({ method: "GET" }).handler(async () => {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [linksRes, itemsRes, quotesRes] = await Promise.all([
    supabaseAdmin
      .from("access_audit_log")
      .select("id,created_at,details")
      .eq("action", "flipp.link_generated")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("sale_flyer_items")
      .select("id,name,sale_price,flipp_short_link,flipp_generated_at,sale_flyer_id")
      .not("flipp_short_link", "is", null)
      .order("flipp_generated_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("quotes")
      .select("id,reference_number,client_name,created_at,total,conversation,notes")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const flippQuotes = (quotesRes.data ?? []).filter((q: any) => {
    const blob = `${JSON.stringify(q.conversation ?? "")} ${q.notes ?? ""}`.toLowerCase();
    return blob.includes("utm_source=flipp") || blob.includes('"utm_source":"flipp"');
  });

  return {
    links: linksRes.data ?? [],
    items: itemsRes.data ?? [],
    quotes: flippQuotes,
    error: linksRes.error?.message || itemsRes.error?.message || quotesRes.error?.message || null,
  };
});
