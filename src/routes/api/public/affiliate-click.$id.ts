import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { withAmazonAffiliateTag, withOneLinkRedirect } from "@/lib/amazon-affiliate";

/**
 * Public click-tracking redirect for affiliate links.
 *
 * Flow:
 *   1. Look up the shop item by id.
 *   2. Log a row in `affiliate_click_events` (a trigger bumps the counter).
 *   3. Build the final outbound URL:
 *        - If onelink_enabled and the link is Amazon → normalize to amazon.com.
 *        - Inject the associate tag from `app_kv.amazon_associate_tag`.
 *   4. 302 redirect.
 *
 * No PII is stored beyond IP-derived country (from CF-IPCountry header) and
 * the user-agent. The user_id is left null for anonymous visitors.
 *
 * Cache headers are set to no-store so analytics are accurate.
 */
export const Route = createFileRoute("/api/public/affiliate-click/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.id;
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Invalid id", { status: 400 });
        }

        const { data: item, error } = await supabaseAdmin
          .from("recipe_shop_items")
          .select("id, url, onelink_enabled, status")
          .eq("id", id)
          .maybeSingle();

        if (error || !item || !item.url) {
          return new Response("Not found", { status: 404 });
        }
        if (item.status === "archived" || item.status === "draft") {
          return new Response("Unavailable", { status: 410 });
        }

        // Resolve the affiliate tag from app_kv (best-effort; missing tag is OK).
        let tag: string | null = null;
        const { data: kv } = await supabaseAdmin
          .from("app_kv")
          .select("value")
          .eq("key", "amazon_associate_tag")
          .maybeSingle();
        if (kv?.value && typeof kv.value === "string") tag = kv.value;
        else if (kv?.value && typeof kv.value === "object" && "tag" in (kv.value as any)) {
          tag = String((kv.value as any).tag ?? "") || null;
        }

        // Build the outbound URL.
        let outbound = item.url;
        if (item.onelink_enabled) outbound = withOneLinkRedirect(outbound);
        outbound = withAmazonAffiliateTag(outbound, tag);

        // Log the click. Fire-and-forget — don't block the redirect on it.
        const country = request.headers.get("cf-ipcountry") ?? null;
        const referrer = request.headers.get("referer") ?? null;
        const ua = request.headers.get("user-agent") ?? null;
        supabaseAdmin
          .from("affiliate_click_events")
          .insert({
            shop_item_id: id,
            country_code: country,
            referrer,
            user_agent: ua,
          })
          .then(({ error: e }) => {
            if (e) console.error("affiliate-click insert failed:", e.message);
          });

        return new Response(null, {
          status: 302,
          headers: {
            Location: outbound,
            "Cache-Control": "no-store, max-age=0",
          },
        });
      },
    },
  },
});
