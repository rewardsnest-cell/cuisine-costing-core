import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { scanVpsfinestAssets, type ScannedImage } from "@/lib/server/scan-vpsfinest-assets";
import { importSiteAssets } from "@/lib/server/import-site-assets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Copy, UploadCloud, Zap, Check } from "lucide-react";
import { toast } from "sonner";

type QuickPick = {
  slug: "hero-home" | "path-recipes" | "path-catering" | "logo-main";
  label: string;
  description: string;
  category: string;
  preferContexts: ScannedImage["context"][];
  keywords: string[];
};

const QUICK_PICKS: QuickPick[] = [
  {
    slug: "hero-home",
    label: "Hero — Home",
    description: "Main banner image for the homepage",
    category: "hero",
    preferContexts: ["og", "hero"],
    keywords: ["hero", "home", "banner", "cover", "header"],
  },
  {
    slug: "path-recipes",
    label: "Path — Recipes",
    description: "Recipe section card image",
    category: "hero",
    preferContexts: ["recipe", "hero", "gallery"],
    keywords: ["recipe", "dish", "food", "menu", "plate"],
  },
  {
    slug: "path-catering",
    label: "Path — Catering",
    description: "Catering section card image",
    category: "hero",
    preferContexts: ["hero", "gallery", "og"],
    keywords: ["catering", "event", "wedding", "buffet", "table"],
  },
];

function pickBestFor(qp: QuickPick, images: ScannedImage[]): ScannedImage | null {
  if (!images.length) return null;
  const scored = images.map((img) => {
    let score = 0;
    const ctxIdx = qp.preferContexts.indexOf(img.context);
    if (ctxIdx >= 0) score += (qp.preferContexts.length - ctxIdx) * 10;
    const hay = `${img.alt || ""} ${img.url} ${img.sourcePage}`.toLowerCase();
    for (const kw of qp.keywords) if (hay.includes(kw)) score += 5;
    if (img.bytes && img.bytes > 50_000) score += 2;
    if (img.bytes && img.bytes > 200_000) score += 2;
    return { img, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].img : images[0];
}

function suggestSlug(img: ScannedImage, idx: number): string {
  const base = (img.alt || img.url.split("/").pop() || `img-${idx}`)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${img.context}-${base || idx}`;
}

export const Route = createFileRoute("/admin/scan-assets")({
  head: () => ({ meta: [{ title: "Scan vpsfinest.com Images — Admin" }] }),
  component: ScanAssetsPage,
});

const CONTEXT_ORDER: ScannedImage["context"][] = ["og", "hero", "recipe", "gallery", "logo", "other"];
const CONTEXT_COLOR: Record<ScannedImage["context"], string> = {
  og: "bg-primary/10 text-primary",
  hero: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  recipe: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  gallery: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  logo: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  other: "bg-muted text-muted-foreground",
};

function ScanAssetsPage() {
  const scan = useServerFn(scanVpsfinestAssets);
  const importFn = useServerFn(importSiteAssets);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof scanVpsfinestAssets>> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [slugs, setSlugs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<ScannedImage["context"] | "all">("all");

  const handleScan = async () => {
    setScanning(true);
    setResult(null);
    setPicked(new Set());
    setSlugs({});
    try {
      const r = await scan();
      setResult(r);
      const auto = new Set(r.images.filter((i) => ["og", "hero", "recipe"].includes(i.context)).map((i) => i.url));
      setPicked(auto);
      const initialSlugs: Record<string, string> = {};
      r.images.forEach((img, idx) => { initialSlugs[img.url] = suggestSlug(img, idx); });
      setSlugs(initialSlugs);
      toast.success(`Found ${r.uniqueImages} unique images across ${r.pagesScanned} pages`);
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleImport = async () => {
    if (!result) return;
    const items = result.images
      .filter((i) => picked.has(i.url))
      .map((i) => ({
        url: i.url,
        alt: i.alt,
        category: i.context,
        slug: slugs[i.url] || suggestSlug(i, 0),
      }));
    if (!items.length) return toast.error("Pick at least one image");
    setImporting(true);
    try {
      const res = await importFn({ data: { items } });
      toast.success(`Imported ${res.imported} · failed ${res.failed}`);
      if (res.errors.length) console.error("Import errors:", res.errors);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const [savedSlugs, setSavedSlugs] = useState<Set<string>>(new Set());
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  const handleSaveAll = async () => {
    if (!result) return toast.error("Run a scan first");
    setSavingAll(true);
    let ok = 0;
    let failed = 0;
    for (const qp of QUICK_PICKS) {
      const best = pickBestFor(qp, result.images);
      if (!best) { failed++; continue; }
      setSavingSlug(qp.slug);
      try {
        const res = await importFn({
          data: { items: [{ url: best.url, alt: best.alt, category: qp.category, slug: qp.slug }] },
        });
        if (res.imported > 0) {
          ok++;
          setSavedSlugs((s) => new Set(s).add(qp.slug));
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    setSavingSlug(null);
    setSavingAll(false);
    if (failed === 0) toast.success(`Saved all ${ok} assets`);
    else toast.error(`Saved ${ok} · failed ${failed}`);
  };

  const handleQuickSave = async (qp: QuickPick) => {
    if (!result) return toast.error("Run a scan first");
    const best = pickBestFor(qp, result.images);
    if (!best) return toast.error("No images available");
    setSavingSlug(qp.slug);
    try {
      const res = await importFn({
        data: { items: [{ url: best.url, alt: best.alt, category: qp.category, slug: qp.slug }] },
      });
      if (res.imported > 0) {
        toast.success(`Saved ${qp.slug}`);
        setSavedSlugs((s) => new Set(s).add(qp.slug));
      } else {
        toast.error(`Failed: ${res.errors[0]?.error || "unknown"}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSavingSlug(null);
    }
  };

  const toggle = (url: string) => {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(url)) n.delete(url); else n.add(url);
      return n;
    });
  };

  const copyManifest = () => {
    if (!result) return;
    const out = result.images.filter((i) => picked.has(i.url));
    navigator.clipboard.writeText(JSON.stringify(out, null, 2));
    toast.success(`Copied ${out.length} image entries to clipboard`);
  };

  const visible = result ? result.images.filter((i) => filter === "all" || i.context === filter) : [];
  const counts = result ? CONTEXT_ORDER.reduce((acc, c) => {
    acc[c] = result.images.filter((i) => i.context === c).length;
    return acc;
  }, {} as Record<string, number>) : {};

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="font-display text-2xl font-bold">Scan vpsfinest.com Images</h2>
        <p className="text-sm text-muted-foreground">
          Read-only preview. Pick the photos you want to keep, then we'll wire them into the rebuild.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1 — Scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleScan} disabled={scanning} className="bg-gradient-warm text-primary-foreground">
            {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            {scanning ? "Scanning (1–3 minutes)..." : "Scan vpsfinest.com"}
          </Button>
          {result && (
            <p className="text-xs text-muted-foreground">
              {result.pagesScanned} pages · {result.totalImages} image refs · {result.uniqueImages} unique · {result.errors.length} errors
            </p>
          )}
        </CardContent>
      </Card>

      {result && result.images.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Quick save — one click per slot
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Picks the best candidate from the scan and uploads it to site-assets with the exact slug.
              </p>
            </div>
            <Button onClick={handleSaveAll} disabled={savingAll} size="sm">
              {savingAll ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Zap className="w-3 h-3 mr-2" />}
              {savingAll ? "Saving all..." : "Save all 3"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {QUICK_PICKS.map((qp) => {
                const best = pickBestFor(qp, result.images);
                const isSaved = savedSlugs.has(qp.slug);
                const isSaving = savingSlug === qp.slug;
                return (
                  <div key={qp.slug} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="aspect-video bg-muted rounded overflow-hidden">
                      {best ? (
                        <img src={best.url} alt={best.alt || ""} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">no candidate</div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{qp.label}</p>
                      <p className="text-xs text-muted-foreground">{qp.description}</p>
                      <p className="text-[10px] font-mono text-muted-foreground mt-1 truncate" title={best?.url}>
                        {best?.alt || best?.url.split("/").pop() || "—"}
                      </p>
                    </div>
                    <Button
                      onClick={() => handleQuickSave(qp)}
                      disabled={!best || isSaving || isSaved}
                      size="sm"
                      className="w-full"
                      variant={isSaved ? "outline" : "default"}
                    >
                      {isSaving ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> :
                        isSaved ? <Check className="w-3 h-3 mr-2" /> :
                        <UploadCloud className="w-3 h-3 mr-2" />}
                      {isSaving ? "Saving..." : isSaved ? `Saved as ${qp.slug}` : `Save as ${qp.slug}`}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {result && result.images.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Step 2 — Pick photos to keep ({picked.size}/{result.images.length})</CardTitle>
              <div className="flex flex-wrap gap-1 mt-2">
                <Badge
                  variant={filter === "all" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setFilter("all")}
                >
                  All ({result.images.length})
                </Badge>
                {CONTEXT_ORDER.filter((c) => counts[c] > 0).map((c) => (
                  <Badge
                    key={c}
                    variant={filter === c ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setFilter(c)}
                  >
                    {c} ({counts[c]})
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={copyManifest} variant="outline" disabled={!picked.size}>
                <Copy className="w-4 h-4 mr-2" />
                Copy JSON
              </Button>
              <Button onClick={handleImport} disabled={!picked.size || importing}>
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                Import {picked.size} to site-assets
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visible.map((img) => {
                const isPicked = picked.has(img.url);
                return (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => toggle(img.url)}
                    className={`text-left rounded-lg overflow-hidden border-2 transition-all ${
                      isPicked ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <div className="aspect-square bg-muted relative">
                      <img
                        src={img.url}
                        alt={img.alt || ""}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2"; }}
                      />
                      <div className="absolute top-2 left-2">
                        <Checkbox checked={isPicked} className="bg-background" />
                      </div>
                      <div className="absolute top-2 right-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CONTEXT_COLOR[img.context]}`}>
                          {img.context}
                        </span>
                      </div>
                    </div>
                    <div className="p-2 space-y-1">
                      {isPicked && (
                        <Input
                          value={slugs[img.url] || ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setSlugs((s) => ({ ...s, [img.url]: e.target.value }))}
                          placeholder="slug"
                          className="h-7 text-xs"
                        />
                      )}
                      <p className="text-xs truncate" title={img.alt || ""}>{img.alt || <span className="text-muted-foreground italic">no alt</span>}</p>
                      <p className="text-[10px] text-muted-foreground truncate" title={img.sourcePage}>
                        {img.sourcePage.replace(SITE_PREFIX, "") || "/"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {img.bytes ? `${(img.bytes / 1024).toFixed(0)} KB` : "—"}
                        {img.contentType ? ` · ${img.contentType.replace("image/", "")}` : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {result && result.errors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-destructive">Errors ({result.errors.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-xs space-y-1 text-muted-foreground">
              {result.errors.slice(0, 20).map((e, i) => (
                <li key={i}><span className="font-mono">{e.url}</span>: {e.error}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const SITE_PREFIX = "https://www.vpsfinest.com";
