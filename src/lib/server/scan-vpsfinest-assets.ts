import { createServerFn } from "@tanstack/react-start";
import Firecrawl from "@mendable/firecrawl-js";

export type ScannedImage = {
  url: string;
  alt: string | null;
  sourcePage: string;
  sourcePageTitle: string | null;
  context: "hero" | "og" | "gallery" | "recipe" | "logo" | "other";
  width?: number;
  height?: number;
  bytes?: number;
  contentType?: string;
};

export type ScanResult = {
  pagesScanned: number;
  totalImages: number;
  uniqueImages: number;
  images: ScannedImage[];
  errors: { url: string; error: string }[];
};

const SITE = "https://www.vpsfinest.com";

function classify(url: string, alt: string | null, ogImages: Set<string>): ScannedImage["context"] {
  const u = url.toLowerCase();
  const a = (alt || "").toLowerCase();
  if (ogImages.has(url)) return "og";
  if (u.includes("logo") || a.includes("logo")) return "logo";
  if (u.includes("hero") || a.includes("hero") || a.includes("banner")) return "hero";
  if (u.includes("/recipe") || a.includes("recipe") || a.includes("dish") || a.includes("plate")) return "recipe";
  if (u.includes("gallery") || u.includes("portfolio")) return "gallery";
  return "other";
}

function extractImagesFromHtml(html: string, pageUrl: string): { url: string; alt: string | null }[] {
  const out: { url: string; alt: string | null }[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  const srcRe = /\bsrc\s*=\s*["']([^"']+)["']/i;
  const dataSrcRe = /\bdata-src\s*=\s*["']([^"']+)["']/i;
  const srcsetRe = /\bsrcset\s*=\s*["']([^"']+)["']/i;
  const altRe = /\balt\s*=\s*["']([^"']*)["']/i;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    const altMatch = tag.match(altRe);
    const alt = altMatch ? altMatch[1] : null;
    let src: string | null = null;
    const sm = tag.match(srcRe);
    if (sm) src = sm[1];
    if (!src) {
      const ds = tag.match(dataSrcRe);
      if (ds) src = ds[1];
    }
    if (!src) {
      const ss = tag.match(srcsetRe);
      if (ss) src = ss[1].split(",")[0].trim().split(/\s+/)[0];
    }
    if (!src) continue;
    try {
      const abs = new URL(src, pageUrl).toString();
      if (abs.startsWith("data:")) continue;
      out.push({ url: abs, alt });
    } catch {}
  }
  // also <source srcset=...>
  const sourceRe = /<source\b[^>]*\bsrcset\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = sourceRe.exec(html))) {
    const first = m[1].split(",")[0].trim().split(/\s+/)[0];
    try {
      const abs = new URL(first, pageUrl).toString();
      if (!abs.startsWith("data:")) out.push({ url: abs, alt: null });
    } catch {}
  }
  // background-image inline style
  const bgRe = /background-image\s*:\s*url\(["']?([^"')]+)["']?\)/gi;
  while ((m = bgRe.exec(html))) {
    try {
      const abs = new URL(m[1], pageUrl).toString();
      if (!abs.startsWith("data:")) out.push({ url: abs, alt: null });
    } catch {}
  }
  return out;
}

function extractOgImage(html: string, pageUrl: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!m) return null;
  try { return new URL(m[1], pageUrl).toString(); } catch { return null; }
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

async function headInfo(url: string): Promise<{ bytes?: number; contentType?: string }> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    if (!r.ok) return {};
    const ct = r.headers.get("content-type") || undefined;
    const cl = r.headers.get("content-length");
    return { contentType: ct, bytes: cl ? Number(cl) : undefined };
  } catch {
    return {};
  }
}

export const scanVpsfinestAssets = createServerFn({ method: "POST" }).handler(async (): Promise<ScanResult> => {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not configured. Connect Firecrawl in Connectors.");
  const fc = new Firecrawl({ apiKey });

  // 1. Map the site to discover pages
  const mapRes: any = await fc.map(SITE, { limit: 200, includeSubdomains: false });
  const allLinks: string[] = (mapRes?.links || mapRes?.data?.links || []).map((l: any) =>
    typeof l === "string" ? l : l?.url
  ).filter(Boolean);

  // Prioritize: home + key marketing pages first, then recipes
  const priorityPaths = ["", "/", "/catering", "/weddings", "/about", "/recipes", "/social", "/contact"];
  const priority = new Set(priorityPaths.map((p) => new URL(p || "/", SITE).toString().replace(/\/$/, "")));
  const sorted = [...allLinks].sort((a, b) => {
    const ap = priority.has(a.replace(/\/$/, "")) ? 0 : 1;
    const bp = priority.has(b.replace(/\/$/, "")) ? 0 : 1;
    return ap - bp;
  }).slice(0, 60);

  const errors: { url: string; error: string }[] = [];
  const seen = new Map<string, ScannedImage>();
  let pagesScanned = 0;
  let totalImages = 0;

  for (const pageUrl of sorted) {
    try {
      const r: any = await fc.scrape(pageUrl, { formats: ["html"], onlyMainContent: false });
      const html: string = r?.html || r?.data?.html || "";
      if (!html) { errors.push({ url: pageUrl, error: "no html returned" }); continue; }
      pagesScanned++;
      const title = extractTitle(html);
      const og = extractOgImage(html, pageUrl);
      const ogSet = new Set<string>();
      if (og) ogSet.add(og);
      const imgs = extractImagesFromHtml(html, pageUrl);
      if (og) imgs.unshift({ url: og, alt: "og:image" });
      totalImages += imgs.length;
      for (const { url, alt } of imgs) {
        if (seen.has(url)) continue;
        // Skip tiny/icon assets by extension hint
        if (/\.(svg|ico)(\?|$)/i.test(url)) continue;
        seen.set(url, {
          url,
          alt,
          sourcePage: pageUrl,
          sourcePageTitle: title,
          context: classify(url, alt, ogSet),
        });
      }
    } catch (e: any) {
      errors.push({ url: pageUrl, error: e?.message || String(e) });
    }
  }

  // Enrich with HEAD requests (parallel, capped) for size/type
  const list = [...seen.values()];
  const CONCURRENCY = 8;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const chunk = list.slice(i, i + CONCURRENCY);
    const infos = await Promise.all(chunk.map((img) => headInfo(img.url)));
    chunk.forEach((img, idx) => {
      img.bytes = infos[idx].bytes;
      img.contentType = infos[idx].contentType;
    });
  }

  // Filter out non-images and tiny tracking pixels
  const images = list.filter((i) => {
    if (i.contentType && !i.contentType.startsWith("image/")) return false;
    if (i.bytes !== undefined && i.bytes < 2000) return false;
    return true;
  });

  return {
    pagesScanned,
    totalImages,
    uniqueImages: images.length,
    images,
    errors,
  };
});
