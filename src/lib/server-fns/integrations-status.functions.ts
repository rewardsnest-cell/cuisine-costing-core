import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export type IntegrationStatus = {
  key: string;
  label: string;
  configured: boolean;
  details: Record<string, any>;
};

export const getIntegrationsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntegrationStatus[]> => {
    await ensureAdmin(context.supabase, context.userId);

    const flippConfigured = !!process.env.FLIPP_BEARER_TOKEN;
    const lovableConfigured = !!process.env.LOVABLE_API_KEY;
    const firecrawlConfigured = !!process.env.FIRECRAWL_API_KEY;
    const supabaseConfigured = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Email log stats (last 7 days, dedup by message_id)
    let emailStats = { sent: 0, failed: 0, suppressed: 0, total: 0 };
    try {
      const { data: rows } = await supabaseAdmin
        .from("email_send_log")
        .select("message_id,status,created_at")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(2000);
      const latest = new Map<string, string>();
      for (const r of rows ?? []) {
        if (r.message_id && !latest.has(r.message_id)) latest.set(r.message_id, r.status);
      }
      for (const status of latest.values()) {
        emailStats.total++;
        if (status === "sent") emailStats.sent++;
        else if (status === "dlq" || status === "failed" || status === "bounced") emailStats.failed++;
        else if (status === "suppressed") emailStats.suppressed++;
      }
    } catch {}

    // Storage bucket sizes
    const buckets = ["recipe-photos", "sale-flyers", "receipts", "site-assets"];
    const storageInfo: Record<string, { count: number; bytes: number }> = {};
    for (const b of buckets) {
      try {
        const { data: list } = await supabaseAdmin.storage.from(b).list("", { limit: 1000 });
        storageInfo[b] = {
          count: list?.length ?? 0,
          bytes: (list ?? []).reduce((s: number, o: any) => s + (o.metadata?.size ?? 0), 0),
        };
      } catch {
        storageInfo[b] = { count: 0, bytes: 0 };
      }
    }

    return [
      {
        key: "flipp",
        label: "Flipp Image Generation",
        configured: flippConfigured,
        details: {
          recipe_template_id: process.env.FLIPP_RECIPE_TEMPLATE_ID || null,
          flyer_template_id: process.env.FLIPP_FLYER_TEMPLATE_ID || null,
        },
      },
      {
        key: "lovable_ai",
        label: "Lovable AI Gateway",
        configured: lovableConfigured,
        details: { models: ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/gpt-5-mini"] },
      },
      {
        key: "firecrawl",
        label: "Firecrawl",
        configured: firecrawlConfigured,
        details: {},
      },
      {
        key: "email",
        label: "Email (Auth + Transactional)",
        configured: true,
        details: { last7days: emailStats },
      },
      {
        key: "storage",
        label: "Supabase Storage",
        configured: supabaseConfigured,
        details: { buckets: storageInfo },
      },
    ];
  });

export const testLovableAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (!process.env.LOVABLE_API_KEY) return { ok: false, message: "LOVABLE_API_KEY not set" };
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: "Reply with the single word: pong" }],
        }),
      });
      const json: any = await res.json();
      const text = json?.choices?.[0]?.message?.content || "(no content)";
      return { ok: res.ok, message: text.slice(0, 200) };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Request failed" };
    }
  });

export const testFirecrawl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (!process.env.FIRECRAWL_API_KEY) return { ok: false, message: "FIRECRAWL_API_KEY not set" };
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://example.com", formats: ["markdown"] }),
      });
      return { ok: res.ok, message: res.ok ? "Firecrawl reachable" : `HTTP ${res.status}` };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Request failed" };
    }
  });

export const testFlipp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (!process.env.FLIPP_BEARER_TOKEN) return { ok: false, message: "FLIPP_BEARER_TOKEN not set" };
    try {
      const res = await fetch("https://useflipp.com/api/templates", {
        headers: { Authorization: `Bearer ${process.env.FLIPP_BEARER_TOKEN}` },
      });
      const data: any = await res.json().catch(() => ({}));
      const count = Array.isArray(data) ? data.length : Array.isArray(data?.data) ? data.data.length : 0;
      return { ok: res.ok, message: res.ok ? `OK — ${count} templates` : `HTTP ${res.status}` };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Request failed" };
    }
  });
