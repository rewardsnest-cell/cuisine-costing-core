import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { scanVpsfinestAssets, type ScannedImage } from "@/lib/server/scan-vpsfinest-assets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Copy } from "lucide-react";
import { toast } from "sonner";

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
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof scanVpsfinestAssets>> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ScannedImage["context"] | "all">("all");

  const handleScan = async () => {
    setScanning(true);
    setResult(null);
    setPicked(new Set());
    try {
      const r = await scan();
      setResult(r);
      // Pre-select og + hero + recipe by default
      const auto = new Set(r.images.filter((i) => ["og", "hero", "recipe"].includes(i.context)).map((i) => i.url));
      setPicked(auto);
      toast.success(`Found ${r.uniqueImages} unique images across ${r.pagesScanned} pages`);
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
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
            <Button onClick={copyManifest} variant="outline" disabled={!picked.size}>
              <Copy className="w-4 h-4 mr-2" />
              Copy {picked.size} as JSON
            </Button>
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
                    <div className="p-2 space-y-0.5">
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
