import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ROUTE_DESCRIPTIONS } from "@/lib/admin/page-descriptions";

export type RouteInventoryRow = {
  route_path: string;
  last_http_status: number | null;
  last_http_checked_at: string | null;
  last_http_error: string | null;
  review_status: "unreviewed" | "reviewed" | "needs_review" | "broken";
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  thumbnail_url: string | null;
  thumbnail_captured_at: string | null;
  thumbnail_error: string | null;
  created_at: string;
  updated_at: string;
};

async function ensureAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Auth check failed");
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

/** Public routes that can be safely fetched without auth. */
function isPublicRoute(path: string): boolean {
  if (path.startsWith("/admin")) return false;
  if (path.startsWith("/employee")) return false;
  if (path.startsWith("/dashboard")) return false;
  if (path.startsWith("/my-")) return false;
  if (path.startsWith("/api/")) return false;
  if (path.startsWith("/hooks/")) return false;
  if (path.startsWith("/lovable/")) return false;
  if (path.startsWith("/email/")) return false;
  if (path.includes("$")) return false; // dynamic params we can't fill in
  return true;
}

function publicBaseUrl(): string {
  // Prefer explicitly configured public URL; fall back to a sensible default.
  const env = (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  return "https://cuisine-costing-core.lovable.app";
}

function decodeRouterPath(routerPath: string): string {
  // Router-encoded paths like /robots[.]txt → /robots.txt
  return routerPath.replace(/\[\.]/g, ".").replace(/\[\/\]/g, "/");
}

/**
 * Seed/refresh the inventory rows so every known route has a database row,
 * and remove rows for routes that no longer exist.
 */
export const syncRouteInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);

    const knownPaths = Object.keys(ROUTE_DESCRIPTIONS);

    // Upsert any missing rows
    const rows = knownPaths.map((p) => ({ route_path: p }));
    const { error: upsertErr } = await (supabaseAdmin as any)
      .from("route_inventory")
      .upsert(rows, { onConflict: "route_path", ignoreDuplicates: true });
    if (upsertErr) throw new Error(upsertErr.message);

    // Remove stale rows
    const { data: existing, error: selErr } = await (supabaseAdmin as any)
      .from("route_inventory")
      .select("route_path");
    if (selErr) throw new Error(selErr.message);
    const stale = (existing ?? [])
      .map((r: any) => r.route_path as string)
      .filter((p: string) => !knownPaths.includes(p));
    if (stale.length > 0) {
      await (supabaseAdmin as any)
        .from("route_inventory")
        .delete()
        .in("route_path", stale);
    }

    return { ok: true, total: knownPaths.length, removed: stale.length };
  });

/** List inventory rows merged with the static description registry. */
export const listRouteInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data, error } = await (supabaseAdmin as any)
      .from("route_inventory")
      .select("*")
      .order("route_path");
    if (error) throw new Error(error.message);
    return (data ?? []) as RouteInventoryRow[];
  });

const refreshSchema = z.object({
  paths: z.array(z.string()).optional(),
});

/** HTTP-check each public route and store status + timestamp. */
export const refreshRouteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => refreshSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const base = publicBaseUrl();
    const allPaths =
      data.paths && data.paths.length > 0
        ? data.paths
        : Object.keys(ROUTE_DESCRIPTIONS);

    const checkable = allPaths.filter(isPublicRoute);
    const skipped = allPaths.filter((p) => !isPublicRoute(p));

    const now = new Date().toISOString();
    const results: { path: string; status: number | null; error: string | null }[] = [];

    // Run in small parallel batches
    const BATCH = 6;
    for (let i = 0; i < checkable.length; i += BATCH) {
      const slice = checkable.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        slice.map(async (path) => {
          const url = base + decodeRouterPath(path);
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 12_000);
          try {
            const res = await fetch(url, {
              method: "GET",
              redirect: "follow",
              signal: ctrl.signal,
              headers: { "User-Agent": "VPSFinest-RouteInventory/1.0" },
            });
            return { path, status: res.status, error: null as string | null };
          } catch (e: any) {
            return { path, status: null, error: e?.message ?? "fetch failed" };
          } finally {
            clearTimeout(t);
          }
        }),
      );
      for (const s of settled) {
        if (s.status === "fulfilled") results.push(s.value);
      }
    }

    // Persist results
    if (results.length > 0) {
      const updates = results.map((r) => ({
        route_path: r.path,
        last_http_status: r.status,
        last_http_checked_at: now,
        last_http_error: r.error,
      }));
      const { error: upErr } = await (supabaseAdmin as any)
        .from("route_inventory")
        .upsert(updates, { onConflict: "route_path" });
      if (upErr) throw new Error(upErr.message);
    }

    const ok = results.filter((r) => r.status && r.status >= 200 && r.status < 400).length;
    const broken = results.length - ok;
    return {
      ok: true,
      checked: results.length,
      skipped: skipped.length,
      healthy: ok,
      broken,
    };
  });

const captureSchema = z.object({
  path: z.string().min(1),
});

/**
 * Capture a thumbnail for one route via the Microlink screenshot API,
 * then upload the PNG into our `route-thumbnails` bucket.
 *
 * Microlink free tier requires no key but is rate-limited — we capture one
 * route per call and let the UI throttle batches.
 */
export const captureRouteThumbnail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => captureSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const path = data.path;
    if (!isPublicRoute(path)) {
      // Mark as not-captureable so the UI can show a helpful message.
      const msg = "Skipped: not a publicly fetchable route (auth/admin/api/dynamic)";
      await (supabaseAdmin as any)
        .from("route_inventory")
        .upsert(
          {
            route_path: path,
            thumbnail_error: msg,
            thumbnail_captured_at: new Date().toISOString(),
          },
          { onConflict: "route_path" },
        );
      return { ok: false, skipped: true, message: msg };
    }

    const targetUrl = publicBaseUrl() + decodeRouterPath(path);
    const apiUrl =
      "https://api.microlink.io/?" +
      new URLSearchParams({
        url: targetUrl,
        screenshot: "true",
        meta: "false",
        embed: "screenshot.url",
        "viewport.width": "1280",
        "viewport.height": "800",
        "viewport.deviceScaleFactor": "1",
        waitUntil: "networkidle0",
        timeout: "20000",
      }).toString();

    let pngBytes: ArrayBuffer;
    try {
      // Ask Microlink for the screenshot URL, then download the PNG.
      const meta = await fetch(apiUrl, {
        headers: { Accept: "application/json" },
      });
      if (!meta.ok) throw new Error(`Microlink failed: HTTP ${meta.status}`);
      const metaJson: any = await meta.json();
      const shotUrl: string | undefined =
        metaJson?.data?.screenshot?.url || metaJson?.data?.url;
      if (!shotUrl) throw new Error("Microlink returned no screenshot URL");

      const png = await fetch(shotUrl);
      if (!png.ok) throw new Error(`Screenshot download failed: HTTP ${png.status}`);
      pngBytes = await png.arrayBuffer();
    } catch (e: any) {
      const msg = e?.message ?? "screenshot capture failed";
      await (supabaseAdmin as any)
        .from("route_inventory")
        .upsert(
          {
            route_path: path,
            thumbnail_error: msg,
            thumbnail_captured_at: new Date().toISOString(),
          },
          { onConflict: "route_path" },
        );
      return { ok: false, message: msg };
    }

    // Upload to storage bucket
    const safeName =
      path === "/"
        ? "_root"
        : path.replace(/^\//, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const objectPath = `${safeName}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("route-thumbnails")
      .upload(objectPath, new Uint8Array(pngBytes), {
        contentType: "image/png",
        upsert: true,
      });
    if (upErr) {
      await (supabaseAdmin as any)
        .from("route_inventory")
        .upsert(
          {
            route_path: path,
            thumbnail_error: upErr.message,
            thumbnail_captured_at: new Date().toISOString(),
          },
          { onConflict: "route_path" },
        );
      return { ok: false, message: upErr.message };
    }

    const { data: pub } = supabaseAdmin.storage
      .from("route-thumbnails")
      .getPublicUrl(objectPath);
    // Cache-bust on every capture
    const url = `${pub.publicUrl}?v=${Date.now()}`;

    await (supabaseAdmin as any)
      .from("route_inventory")
      .upsert(
        {
          route_path: path,
          thumbnail_url: url,
          thumbnail_captured_at: new Date().toISOString(),
          thumbnail_error: null,
        },
        { onConflict: "route_path" },
      );

    return { ok: true, url };
  });

const reviewSchema = z.object({
  path: z.string().min(1),
  review_status: z.enum(["unreviewed", "reviewed", "needs_review", "broken"]),
  review_notes: z.string().max(2000).nullable().optional(),
});

export const setRouteReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { error } = await (supabaseAdmin as any)
      .from("route_inventory")
      .upsert(
        {
          route_path: data.path,
          review_status: data.review_status,
          review_notes: data.review_notes ?? null,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "route_path" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
