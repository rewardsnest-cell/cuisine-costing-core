import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  extractBrandColors,
  applyBrandPalette,
  hexToOklchString,
  type BrandPalette,
} from "@/lib/server/extract-brand-colors";

export const Route = createFileRoute("/admin/brand-colors")({
  component: BrandColorsPage,
});

const SWATCH_KEYS: { key: keyof BrandPalette; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "textPrimary", label: "Text" },
  { key: "textSecondary", label: "Muted text" },
];

function BrandColorsPage() {
  const [palette, setPalette] = useState<BrandPalette | null>(null);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ token: string; hex: string; oklch: string }[] | null>(null);

  const scan = async () => {
    setScanning(true);
    setApplied(null);
    try {
      const result = await extractBrandColors();
      setPalette(result);
      toast.success("Extracted brand palette from vpsfinest.com");
    } catch (e: any) {
      toast.error(e.message || "Failed to extract brand colors");
    } finally {
      setScanning(false);
    }
  };

  const apply = async () => {
    if (!palette) return;
    setApplying(true);
    try {
      const res = await applyBrandPalette({ data: { palette } });
      setApplied(res.applied);
      toast.success(`Updated ${res.count} design tokens in styles.css`);
    } catch (e: any) {
      toast.error(e.message || "Failed to apply palette");
    } finally {
      setApplying(false);
    }
  };

  const updateColor = (key: keyof BrandPalette, value: string) => {
    setPalette((prev) => ({ ...(prev || {}), [key]: value }));
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="font-display text-3xl text-primary">Brand colors</h1>
        <p className="text-muted-foreground mt-1">
          Pull the live VPS Finest palette from the scraped logo and site, preview, then write it into the design tokens.
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={scan} disabled={scanning}>
          {scanning ? "Scanning vpsfinest.com…" : "Extract palette from logo"}
        </Button>
        {palette && (
          <Button onClick={apply} disabled={applying} variant="outline">
            {applying ? "Writing…" : "Apply to design tokens"}
          </Button>
        )}
      </div>

      {palette && (
        <Card>
          <CardHeader>
            <CardTitle>Detected palette</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {palette.logo && (
              <div className="flex items-center gap-3 pb-4 border-b">
                <img src={palette.logo} alt="Logo" className="h-12 w-12 object-contain bg-secondary rounded" />
                <span className="text-sm text-muted-foreground break-all">{palette.logo}</span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {SWATCH_KEYS.map(({ key, label }) => {
                const hex = (palette[key] as string | undefined) || "";
                const oklch = hex ? hexToOklchString(hex) : null;
                return (
                  <div key={key} className="space-y-2">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
                    <div
                      className="h-16 rounded border"
                      style={{ background: hex || "transparent" }}
                    />
                    <input
                      type="text"
                      value={hex}
                      onChange={(e) => updateColor(key, e.target.value)}
                      placeholder="#000000"
                      className="w-full text-xs font-mono px-2 py-1 border rounded bg-background"
                    />
                    {oklch && <div className="text-[10px] font-mono text-muted-foreground truncate">{oklch}</div>}
                  </div>
                );
              })}
            </div>
            {palette.fonts && palette.fonts.length > 0 && (
              <div className="pt-4 border-t text-sm">
                <span className="text-muted-foreground">Detected fonts: </span>
                {palette.fonts.join(", ")}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {applied && (
        <Card>
          <CardHeader>
            <CardTitle>Applied tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 font-mono text-xs">
              {applied.map((a) => (
                <div key={a.token} className="flex items-center gap-3">
                  <span
                    className="inline-block w-4 h-4 rounded border"
                    style={{ background: a.hex }}
                  />
                  <span className="text-foreground w-40">{a.token}</span>
                  <span className="text-muted-foreground">{a.hex}</span>
                  <span className="text-muted-foreground ml-auto">{a.oklch}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Reload the preview to see the new palette across the site.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
