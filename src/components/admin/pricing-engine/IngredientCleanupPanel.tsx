import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Sparkles, Merge, AlertTriangle, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import {
  peFindIngredientDuplicates,
  peMergeIngredients,
} from "@/lib/server-fns/pricing-engine.functions";

type Cluster = {
  canonical_id: string;
  canonical_name: string;
  base_unit: string;
  members: { id: string; name: string; base_unit: string; score: number; source: "fuzzy" | "ai" }[];
  confidence: number;
};

export function IngredientCleanupPanel() {
  const findFn = useServerFn(peFindIngredientDuplicates);
  const mergeFn = useServerFn(peMergeIngredients);
  const [scanning, setScanning] = useState(false);
  const [merging, setMerging] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [threshold, setThreshold] = useState(0.85);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [meta, setMeta] = useState<{ scanned: number; ai_pairs: number } | null>(null);
  // selected losing-member ids per canonical id
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const scan = async () => {
    setScanning(true);
    try {
      const res = await findFn({ data: { use_ai: useAI, min_confidence: threshold } });
      setClusters(res.clusters as Cluster[]);
      setMeta({ scanned: res.scanned, ai_pairs: res.ai_pairs_evaluated });
      // Pre-select all members of clusters at/above threshold
      const next: Record<string, Set<string>> = {};
      for (const c of res.clusters as Cluster[]) {
        if (c.confidence >= threshold) {
          next[c.canonical_id] = new Set(c.members.map((m) => m.id));
        } else {
          next[c.canonical_id] = new Set();
        }
      }
      setSelected(next);
      toast.success(
        `Scanned ${res.scanned} ingredients · ${res.clusters.length} duplicate groups found · ${res.auto_mergeable} above threshold`,
      );
    } catch (e: any) {
      toast.error(e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const toggleMember = (canonical_id: string, member_id: string) => {
    setSelected((prev) => {
      const set = new Set(prev[canonical_id] ?? []);
      if (set.has(member_id)) set.delete(member_id);
      else set.add(member_id);
      return { ...prev, [canonical_id]: set };
    });
  };

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSelected = Object.values(selected).reduce((s, set) => s + set.size, 0);

  const mergeOne = async (cluster: Cluster, ids: string[]) => {
    const r = await mergeFn({
      data: { canonical_id: cluster.canonical_id, losing_ids: ids },
    });
    return r;
  };

  const mergeSelected = async () => {
    const work = clusters
      .map((c) => ({ c, ids: Array.from(selected[c.canonical_id] ?? []) }))
      .filter((w) => w.ids.length > 0);
    if (work.length === 0) {
      toast.error("Nothing selected");
      return;
    }
    setMerging(true);
    let merged = 0,
      prices = 0,
      aliases = 0,
      failed = 0;
    for (const w of work) {
      try {
        const r = await mergeOne(w.c, w.ids);
        merged += r.merged_count;
        prices += r.prices_repointed;
        aliases += r.aliases_added;
      } catch (e: any) {
        failed++;
        console.error("merge failed for", w.c.canonical_name, e);
      }
    }
    setMerging(false);
    toast.success(
      `Merged ${merged} duplicates · ${prices} price rows moved · ${aliases} aliases added${failed ? ` · ${failed} failures` : ""}`,
    );
    // re-scan to refresh
    await scan();
  };

  const autoMergeAboveThreshold = async () => {
    setMerging(true);
    let merged = 0,
      groups = 0,
      failed = 0;
    for (const c of clusters) {
      if (c.confidence < threshold) continue;
      try {
        const r = await mergeFn({
          data: {
            canonical_id: c.canonical_id,
            losing_ids: c.members.map((m) => m.id),
          },
        });
        merged += r.merged_count;
        groups++;
      } catch (e) {
        failed++;
      }
    }
    setMerging(false);
    toast.success(
      `Auto-merged ${groups} groups (${merged} duplicates removed)${failed ? ` · ${failed} failures` : ""}`,
    );
    await scan();
  };

  const aboveThreshold = clusters.filter((c) => c.confidence >= threshold).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Auto-match &amp; Clean Duplicate Ingredients
          </CardTitle>
          <CardDescription>
            Scans the ingredient catalog for duplicates created from messy recipe naming
            (e.g. <em>tomatoes</em> vs <em>tomato</em>, <em>scallions</em> vs <em>green onions</em>).
            Uses local fuzzy matching first, then Lovable AI for ambiguous pairs.
            Merging re-points all prices, history, and aliases to the canonical ingredient.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex items-center gap-3">
              <Switch id="use-ai" checked={useAI} onCheckedChange={setUseAI} />
              <Label htmlFor="use-ai" className="cursor-pointer">
                Use AI for ambiguous pairs
              </Label>
            </div>
            <div className="flex-1 min-w-[260px]">
              <Label className="mb-2 block">
                Auto-merge confidence threshold:{" "}
                <span className="font-mono font-semibold">{Math.round(threshold * 100)}%</span>
              </Label>
              <Slider
                value={[threshold]}
                min={0.6}
                max={1}
                step={0.01}
                onValueChange={(v) => setThreshold(v[0])}
              />
            </div>
            <Button onClick={scan} disabled={scanning} className="gap-2">
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {scanning ? "Scanning…" : "Scan for duplicates"}
            </Button>
          </div>

          {meta && (
            <div className="text-sm text-muted-foreground">
              Scanned <strong>{meta.scanned}</strong> ingredients · evaluated{" "}
              <strong>{meta.ai_pairs}</strong> ambiguous pairs with AI · found{" "}
              <strong>{clusters.length}</strong> duplicate groups (
              <strong>{aboveThreshold}</strong> above threshold).
            </div>
          )}
        </CardContent>
      </Card>

      {clusters.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Duplicate Groups</CardTitle>
              <CardDescription>
                Selected {totalSelected} duplicates across {clusters.length} groups.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={autoMergeAboveThreshold}
                disabled={merging || aboveThreshold === 0}
                variant="default"
                className="gap-2"
              >
                {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
                Auto-merge {aboveThreshold} groups ≥ {Math.round(threshold * 100)}%
              </Button>
              <Button
                onClick={mergeSelected}
                disabled={merging || totalSelected === 0}
                variant="outline"
                className="gap-2"
              >
                <Merge className="w-4 h-4" />
                Merge {totalSelected} selected
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {clusters.map((c) => {
              const isOpen = openIds.has(c.canonical_id);
              const sel = selected[c.canonical_id] ?? new Set();
              const above = c.confidence >= threshold;
              return (
                <div
                  key={c.canonical_id}
                  className={`rounded-lg border p-3 ${above ? "border-success/50 bg-success/5" : "border-warning/40 bg-warning/5"}`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleOpen(c.canonical_id)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Toggle"
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{c.canonical_name}</span>
                        <Badge variant="outline" className="text-xs">{c.base_unit}</Badge>
                        <Badge
                          variant={above ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {Math.round(c.confidence * 100)}% confidence
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          → merging {sel.size}/{c.members.length} duplicates
                        </span>
                      </div>
                      {!isOpen && (
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {c.members.map((m) => m.name).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-3 pl-7 space-y-1">
                      <p className="text-xs font-medium text-foreground mb-1">
                        Will merge INTO: <span className="font-mono">{c.canonical_name}</span> (kept)
                      </p>
                      {c.members.map((m) => (
                        <label
                          key={m.id}
                          className="flex items-center gap-3 py-1 px-2 rounded hover:bg-accent/40 cursor-pointer"
                        >
                          <Checkbox
                            checked={sel.has(m.id)}
                            onCheckedChange={() => toggleMember(c.canonical_id, m.id)}
                          />
                          <span className="flex-1 text-sm">{m.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {Math.round(m.score * 100)}%
                          </Badge>
                          <Badge
                            variant={m.source === "ai" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {m.source === "ai" ? "AI" : "fuzzy"}
                          </Badge>
                        </label>
                      ))}
                      <div className="flex items-start gap-2 mt-2 p-2 rounded bg-muted/40 text-xs text-muted-foreground">
                        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>
                          Merging deletes the losing ingredient rows and re-points all
                          price data, history, and aliases to the canonical ingredient.
                          The losing names become aliases for future imports.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
