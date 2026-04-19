// Flipp image generation API integration (https://useflipp.com/api).
// All endpoints are server-only; the bearer token never reaches the browser.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FLIPP_BASE = "https://api.useflipp.com/v1";

function getToken(): string {
  const t = process.env.FLIPP_BEARER_TOKEN;
  if (!t) throw new Error("FLIPP_BEARER_TOKEN is not configured");
  return t;
}

async function flipp<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${FLIPP_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const detail = (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
    throw new Error(`Flipp ${res.status}: ${String(detail).slice(0, 300)}`);
  }
  return json as T;
}

// ---------- Templates ----------

export const listFlippTemplates = createServerFn({ method: "GET" }).handler(async () => {
  const data = await flipp<any>("/templates");
  const arr: any[] = Array.isArray(data) ? data : (data?.data ?? data?.templates ?? []);
  const templates = arr.map((t) => ({
    id: String(t.id ?? t.uid ?? ""),
    name: String(t.name ?? t.title ?? "Untitled"),
    width: t.width ?? null,
    height: t.height ?? null,
    preview_url: t.preview_url ?? t.thumbnail_url ?? null,
  })).filter((t) => t.id);
  return { templates };
});

// Returns default template ids: app_kv override (admin-editable) → env var fallback.
export const getFlippDefaults = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("app_kv")
    .select("key,value")
    .in("key", ["integration.flipp.recipe_template_id", "integration.flipp.flyer_template_id"]);
  const kv = new Map<string, string | null>((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    recipe_template_id: kv.get("integration.flipp.recipe_template_id") ?? process.env.FLIPP_RECIPE_TEMPLATE_ID ?? null,
    flyer_template_id: kv.get("integration.flipp.flyer_template_id") ?? process.env.FLIPP_FLYER_TEMPLATE_ID ?? null,
  };
});

// ---------- Image generation ----------

type FlippValue = { name: string; value: string | null };

type Target =
  | { kind: "recipe"; id: string; column?: "image_url" | "coupon_image_url" }
  | { kind: "sale_flyer"; id: string; column?: "image_url" }
  | { kind: "sale_flyer_item"; id: string; column?: "promo_image_url" }
  | { kind: "none" };

type GenerateInput = {
  template_id: string;
  values: FlippValue[];
  target?: Target;
};

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 20; // ~40s ceiling

function extractImageUrl(payload: any): { url: string | null; status: string; width: number | null; height: number | null } {
  const url =
    payload?.image_url ??
    payload?.url ??
    payload?.data?.image_url ??
    payload?.data?.url ??
    payload?.result?.image_url ??
    null;
  const status = String(
    payload?.status ?? payload?.data?.status ?? payload?.state ?? (url ? "ready" : "processing")
  ).toLowerCase();
  const width = payload?.width ?? payload?.data?.width ?? null;
  const height = payload?.height ?? payload?.data?.height ?? null;
  return { url, status, width, height };
}

async function pollForImage(jobId: string): Promise<{ url: string; width: number | null; height: number | null }> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const data = await flipp(`/images/${encodeURIComponent(jobId)}`);
    const { url, status, width, height } = extractImageUrl(data);
    if (url && (status === "ready" || status === "complete" || status === "completed" || status === "success")) {
      return { url, width, height };
    }
    if (status === "failed" || status === "error") {
      throw new Error(`Flipp render failed (job ${jobId})`);
    }
  }
  throw new Error("Timed out waiting for Flipp to render the image");
}

function bucketAndTableFor(target: Exclude<Target, { kind: "none" }>): {
  bucket: string;
  table: "recipes" | "sale_flyers" | "sale_flyer_items";
  column: string;
} {
  if (target.kind === "recipe") {
    return {
      bucket: "recipe-photos",
      table: "recipes",
      column: target.column ?? "image_url",
    };
  }
  if (target.kind === "sale_flyer") {
    return {
      bucket: "sale-flyers",
      table: "sale_flyers",
      column: target.column ?? "image_url",
    };
  }
  return {
    bucket: "sale-flyers",
    table: "sale_flyer_items",
    column: target.column ?? "promo_image_url",
  };
}

async function persistToStorage(imageUrl: string, target: Target): Promise<string> {
  if (target.kind === "none") return imageUrl;

  const { bucket, table, column } = bucketAndTableFor(target);
  const path = `${target.id}/flipp-${column}-${Date.now()}.png`;

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download Flipp image (${imgRes.status})`);
  const contentType = imgRes.headers.get("content-type") || "image/png";
  const bytes = new Uint8Array(await imgRes.arrayBuffer());

  const { error: upErr } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  const finalUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updErr } = await supabaseAdmin
    .from(table)
    .update({ [column]: finalUrl } as any)
    .eq("id", target.id);
  if (updErr) throw new Error(`DB update failed: ${updErr.message}`);

  return finalUrl;
}

export const generateFlippImage = createServerFn({ method: "POST" })
  .inputValidator((input: GenerateInput) => {
    if (!input?.template_id || typeof input.template_id !== "string") {
      throw new Error("template_id is required");
    }
    if (!Array.isArray(input.values)) {
      throw new Error("values must be an array");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const created = await flipp("/images", {
      method: "POST",
      body: JSON.stringify({
        template_id: data.template_id,
        values: data.values,
      }),
    });

    let { url, status, width, height } = extractImageUrl(created);
    const jobId = created?.id ?? created?.data?.id ?? created?.job_id;

    if (!url || (status !== "ready" && status !== "complete" && status !== "completed" && status !== "success")) {
      if (!jobId) throw new Error("Flipp did not return a job id and no image_url was present");
      const polled = await pollForImage(String(jobId));
      url = polled.url;
      width = polled.width;
      height = polled.height;
    }

    if (!url) throw new Error("Flipp returned no image_url");

    const target = data.target ?? { kind: "none" };
    const finalUrl = await persistToStorage(url, target);

    return { image_url: finalUrl, source_url: url, width, height };
  });
