import { createServerFn } from "@tanstack/react-start";
import Firecrawl from "@mendable/firecrawl-js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SITE = "https://www.vpsfinest.com";

export type BrandPalette = {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  textPrimary?: string;
  textSecondary?: string;
  logo?: string;
  fonts?: string[];
};

function getClient() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not configured. Connect Firecrawl in Connectors.");
  return new Firecrawl({ apiKey });
}

export const extractBrandColors = createServerFn({ method: "POST" }).handler(
  async (): Promise<BrandPalette> => {
    const fc = getClient();
    const result: any = await fc.scrape(SITE, { formats: ["branding"] });
    const branding = result.branding ?? result.data?.branding ?? {};
    const colors = branding.colors ?? {};
    return {
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
      background: colors.background,
      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      logo: branding.logo ?? branding.images?.logo,
      fonts: (branding.fonts ?? []).map((f: any) => f.family).filter(Boolean),
    };
  },
);

// ---- HEX → OKLCH conversion (sRGB → linear → XYZ → OKLab → OKLCH) ----
function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}
export function hexToOklchString(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [L, C, H] = rgbToOklch(rgb[0], rgb[1], rgb[2]);
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

export const applyBrandPalette = createServerFn({ method: "POST" })
  .inputValidator((input: { palette: BrandPalette }) => input)
  .handler(async ({ data }) => {
    const p = data.palette;
    const cssPath = path.join(process.cwd(), "src", "styles.css");
    const original = await fs.readFile(cssPath, "utf8");

    const map: Record<string, string | undefined> = {
      "--background": p.background,
      "--card": p.background,
      "--popover": p.background,
      "--foreground": p.textPrimary,
      "--card-foreground": p.textPrimary,
      "--popover-foreground": p.textPrimary,
      "--muted-foreground": p.textSecondary,
      "--primary": p.primary,
      "--secondary": p.secondary,
      "--muted": p.secondary,
      "--accent": p.accent ?? p.primary,
      "--ring": p.primary,
      "--warm": p.primary,
    };

    let updated = original;
    const applied: { token: string; hex: string; oklch: string }[] = [];
    for (const [token, hex] of Object.entries(map)) {
      if (!hex) continue;
      const oklch = hexToOklchString(hex);
      if (!oklch) continue;
      const re = new RegExp(`(${token.replace(/[-]/g, "\\-")}\\s*:\\s*)[^;]+;`);
      if (re.test(updated)) {
        updated = updated.replace(re, `$1${oklch};`);
        applied.push({ token, hex, oklch });
      }
    }

    await fs.writeFile(cssPath, updated, "utf8");
    return { applied, count: applied.length };
  });
