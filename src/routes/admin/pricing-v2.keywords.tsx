// Pricing v2 — Keyword library + bulk sweep admin page.
// Lets admins curate Kroger search keywords and run a single combined
// catalog bootstrap pass over the selected ones.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Play, Plus, Trash2, ListChecks, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  listKeywordLibrary,
  addKeyword,
  bulkAddKeywords,
  bulkSetEnabled,
  deleteKeywords,
  type KeywordRow,
} from "@/lib/server-fns/pricing-v2-keywords.functions";
import { runCatalogBootstrap } from "@/lib/server-fns/pricing-v2-catalog.functions";

export const Route = createFileRoute("/admin/pricing-v2/keywords")({
  head: () => ({ meta: [{ title: "Pricing v2 — Keyword Library & Sweep" }] }),
  component: KeywordsPage,
});

function KeywordsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [newKeyword, setNewKeyword] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [keywordLimit, setKeywordLimit] = useState<number>(250);
  const [skipWeight, setSkipWeight] = useState(true);
  const [dryRun, setDryRun] = useState(false);

  const lib = useQuery({
    queryKey: ["pricing-v2", "keywords", "library"],
    queryFn: () => listKeywordLibrary(),
  });

  const rows = lib.data?.rows ?? [];
  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.category && set.add(r.category));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter !== "all" && (r.category ?? "") !== categoryFilter) return false;
      if (f && !r.keyword.toLowerCase().includes(f)) return false;
      return true;
    });
  }, [rows, filter, categoryFilter]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((r) => next.delete(r.id));
      } else {
        filtered.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const addMut = useMutation({
    mutationFn: () =>
      addKeyword({ data: { keyword: newKeyword.trim(), category: newCategory.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Keyword added");
      setNewKeyword("");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keywords", "library"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Add failed"),
  });

  const bulkAddMut = useMutation({
    mutationFn: () => {
      const list = bulkText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return bulkAddKeywords({
        data: { keywords: list, category: bulkCategory.trim() || undefined },
      });
    },
    onSuccess: (res) => {
      toast.success(`Added ${res.added} keyword${res.added === 1 ? "" : "s"} (${res.skipped} duplicates skipped)`);
      setBulkText("");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keywords", "library"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk add failed"),
  });

  const enableMut = useMutation({
    mutationFn: (enabled: boolean) =>
      bulkSetEnabled({ data: { ids: Array.from(selected), enabled } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keywords", "library"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteKeywords({ data: { ids: Array.from(selected) } }),
    onSuccess: (res) => {
      toast.success(`Deleted ${res.deleted}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keywords", "library"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const sweepMut = useMutation({
    mutationFn: async () => {
      const terms = rows
        .filter((r) => selected.has(r.id) && r.enabled)
        .map((r) => r.keyword);
      if (!terms.length) throw new Error("No enabled keywords selected");
      const res = await runCatalogBootstrap({
        data: {
          dry_run: dryRun,
          keywords: terms,
          keyword_limit: keywordLimit,
          skip_weight_normalization: skipWeight,
          batch_size: 1, // we don't want this run to also chew through inventory IDs
          bypass_min_mapped_check: true,
        } as any,
      });
      return res;
    },
    onSuccess: (res: any) => {
      const inCount = res?.counts_in ?? 0;
      const outCount = res?.counts_out ?? 0;
      toast.success(`Sweep complete — fetched ${inCount}, persisted ${outCount}`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keywords", "library"] });
      qc.invalidateQueries({ queryKey: ["pricing-v2", "catalog", "runs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sweep failed"),
  });

  const selectedEnabledCount = rows.filter((r) => selected.has(r.id) && r.enabled).length;

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            to="/admin/pricing-v2/catalog"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> Back to Catalog
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Keyword library &amp; sweep</h1>
          <p className="text-sm text-muted-foreground">
            Curate Kroger product search terms, then sweep all selected keywords into the catalog in one run.
          </p>
        </div>
      </div>

      <Alert>
        <ListChecks className="w-4 h-4" />
        <AlertTitle>How this works</AlertTitle>
        <AlertDescription className="text-sm">
          Kroger&apos;s API has no &quot;list all products&quot; endpoint — products can only be fetched by keyword search or by specific UPC.
          Add keywords below, select the ones you want, and click <strong>Run sweep on selected</strong>.
          Each keyword runs an independent search (up to {keywordLimit} hits each); results are merged, de-duplicated, and ingested into the catalog.
        </AlertDescription>
      </Alert>

      {/* Sweep controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run sweep</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="keyword-limit">Hits per keyword</Label>
              <Input
                id="keyword-limit"
                type="number"
                min={1}
                max={500}
                className="w-32"
                value={keywordLimit}
                onChange={(e) => setKeywordLimit(Math.max(1, Math.min(500, Number(e.target.value) || 250)))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="skip-weight" checked={skipWeight} onCheckedChange={setSkipWeight} />
              <Label htmlFor="skip-weight" className="text-sm">Skip weight normalization</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="dry-run" checked={dryRun} onCheckedChange={setDryRun} />
              <Label htmlFor="dry-run" className="text-sm">Dry run (no writes)</Label>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {selectedEnabledCount} enabled / {selected.size} selected
              </span>
              <Button
                onClick={() => sweepMut.mutate()}
                disabled={sweepMut.isPending || selectedEnabledCount === 0}
              >
                {sweepMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run sweep on selected
              </Button>
            </div>
          </div>
          {sweepMut.isPending && (
            <p className="text-xs text-muted-foreground">
              Sweeping {selectedEnabledCount} keyword{selectedEnabledCount === 1 ? "" : "s"} — this may take a minute or two depending on Kroger response time.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add keywords */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a keyword</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-kw">Keyword</Label>
              <Input
                id="new-kw"
                placeholder="e.g. ricotta cheese"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-cat">Category (optional)</Label>
              <Input
                id="new-cat"
                placeholder="dairy"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              onClick={() => addMut.mutate()}
              disabled={!newKeyword.trim() || addMut.isPending}
            >
              {addMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bulk add (paste list)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder={"One keyword per line, or comma-separated\nbasil\noregano\nthyme"}
              rows={4}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Input
                placeholder="Category (optional)"
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="max-w-xs"
              />
              <Button
                size="sm"
                onClick={() => bulkAddMut.mutate()}
                disabled={!bulkText.trim() || bulkAddMut.isPending}
              >
                {bulkAddMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add all
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Library */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Library ({rows.length})</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-48"
            />
            <select
              className="border rounded-md text-sm h-9 px-2 bg-background"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set(rows.map((r) => r.id)))}>
              Select all
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => enableMut.mutate(true)}
              disabled={selected.size === 0 || enableMut.isPending}
            >
              Enable
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => enableMut.mutate(false)}
              disabled={selected.size === 0 || enableMut.isPending}
            >
              Disable
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm(`Delete ${selected.size} keyword(s)?`)) deleteMut.mutate();
              }}
              disabled={selected.size === 0 || deleteMut.isPending}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {lib.isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No keywords match.</div>
          ) : (
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2 w-10">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={toggleAllFiltered}
                        aria-label="Select all filtered"
                      />
                    </th>
                    <th className="p-2">Keyword</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Enabled</th>
                    <th className="p-2">Last run</th>
                    <th className="p-2 text-right">Last hits</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <KeywordRowView key={r.id} row={r} checked={selected.has(r.id)} onToggle={() => toggleOne(r.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KeywordRowView({
  row,
  checked,
  onToggle,
}: {
  row: KeywordRow;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="p-2">
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`Select ${row.keyword}`} />
      </td>
      <td className="p-2 font-medium">{row.keyword}</td>
      <td className="p-2">
        {row.category ? <Badge variant="secondary">{row.category}</Badge> : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="p-2">
        {row.enabled ? <Badge>on</Badge> : <Badge variant="outline">off</Badge>}
      </td>
      <td className="p-2 text-muted-foreground">
        {row.last_run_at ? new Date(row.last_run_at).toLocaleString() : "—"}
      </td>
      <td className="p-2 text-right tabular-nums">{row.last_hits ?? "—"}</td>
    </tr>
  );
}
