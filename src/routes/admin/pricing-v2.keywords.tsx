// Pricing v2 — Keyword library + bulk sweep admin page.
// Lets admins curate Kroger search keywords and run a single combined
// catalog bootstrap pass over the selected ones.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  getKeywordSweepMetrics,
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

      {/* Schedules */}
      <SchedulesSection
        rows={rows}
        currentSelection={Array.from(selected)}
        keywordLimit={keywordLimit}
        skipWeight={skipWeight}
      />

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

// ----- Schedules -----------------------------------------------------------

import { CalendarClock, Save, Pencil, X as XIcon, Bell, CheckCheck, Eraser, Info, ArrowDownToLine, RefreshCw, PowerOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listKeywordSchedules,
  upsertKeywordSchedule,
  deleteKeywordSchedule,
  runKeywordScheduleNow,
  type ScheduleRow,
} from "@/lib/server-fns/pricing-v2-keyword-schedules.functions";
import {
  listScheduleNotifications,
  markScheduleNotificationsRead,
  clearScheduleNotifications,
  type ScheduleNotification,
} from "@/lib/server-fns/pricing-v2-schedule-notifications.functions";

type LimitMode = "forever" | "until" | "runs" | "continuous";

function SchedulesSection({
  rows,
  currentSelection,
  keywordLimit,
  skipWeight,
}: {
  rows: KeywordRow[];
  currentSelection: string[];
  keywordLimit: number;
  skipWeight: boolean;
}) {
  const qc = useQueryClient();
  // Per-schedule live "Start" status (queued → running → completed/failed).
  type RunPhase = "queued" | "running" | "completed" | "failed";
  type RunStatus = {
    startedAt: number;
    baselineLastRunAt: string | null;
    phase: RunPhase;
    endedAt?: number;
    error?: string;
  };
  const [runStatusMap, setRunStatusMap] = useState<Record<string, RunStatus>>({});
  // 1Hz tick to keep elapsed timers fresh.
  const [, setNowTick] = useState(0);
  const hasActiveRun = Object.values(runStatusMap).some(
    (r) => r.phase === "queued" || r.phase === "running",
  );

  const schedules = useQuery({
    queryKey: ["pricing-v2", "keyword-schedules"],
    queryFn: () => listKeywordSchedules(),
    // Poll faster while we're tracking an in-flight Start so the user sees
    // it transition through queued → running → completed.
    refetchInterval: hasActiveRun ? 5000 : false,
  });

  useEffect(() => {
    if (!hasActiveRun) return;
    const t = window.setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [hasActiveRun]);

  // Watch the schedule list: when last_run_at advances past the baseline we
  // captured at Start time, flip the card to "completed". Auto-clear after a
  // few seconds so the card returns to its normal resting state.
  useEffect(() => {
    const list = schedules.data?.rows ?? [];
    setRunStatusMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of list) {
        const cur = next[s.id];
        if (!cur) continue;
        if (cur.phase === "queued" || cur.phase === "running") {
          const advanced =
            (s.last_run_at ?? null) !== (cur.baselineLastRunAt ?? null) &&
            s.last_run_at != null;
          if (advanced) {
            next[s.id] = { ...cur, phase: "completed", endedAt: Date.now() };
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [schedules.data]);

  // Auto-clear completed/failed entries after 10s.
  useEffect(() => {
    const finished = Object.entries(runStatusMap).filter(
      ([, r]) => r.phase === "completed" || r.phase === "failed",
    );
    if (!finished.length) return;
    const timers = finished.map(([id, r]) => {
      const remaining = Math.max(0, 10_000 - (Date.now() - (r.endedAt ?? Date.now())));
      return window.setTimeout(() => {
        setRunStatusMap((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
      }, remaining);
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [runStatusMap]);

  // Heuristic to surface "running": once the cron tick should have picked up
  // the queued run (>= 60s after Start, or once next_run_at falls in the past),
  // promote queued → running so the user sees forward motion.
  useEffect(() => {
    if (!hasActiveRun) return;
    const list = schedules.data?.rows ?? [];
    const now = Date.now();
    setRunStatusMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of list) {
        const cur = next[s.id];
        if (!cur || cur.phase !== "queued") continue;
        const elapsed = now - cur.startedAt;
        const nextRunMs = s.next_run_at ? new Date(s.next_run_at).getTime() : Infinity;
        if (elapsed >= 60_000 || nextRunMs <= now) {
          next[s.id] = { ...cur, phase: "running" };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // Re-evaluate every second alongside the timer tick.
  });

  // Form state — used for both "new" (no editingId) and "edit" (editingId set)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<number>(24);
  const [useAllKeywords, setUseAllKeywords] = useState(false);
  const [limitMode, setLimitMode] = useState<LimitMode>("forever");
  const [untilDate, setUntilDate] = useState(""); // yyyy-mm-dd
  const [maxRuns, setMaxRuns] = useState<number>(10);
  const [continuousIntervalSec, setContinuousIntervalSec] = useState<number>(60);
  const [emptyRunsThreshold, setEmptyRunsThreshold] = useState<number>(2);
  const [filterMode, setFilterMode] = useState<"include" | "exclude">("include");
  // Snapshot of keyword_ids being edited (for non-"all" mode). When creating
  // new, we use the live `currentSelection` from the parent.
  const [editKeywordIds, setEditKeywordIds] = useState<string[]>([]);
  const formRef = useRef<HTMLDivElement | null>(null);
  // Remember where the user was scrolled when they opened the edit form, so
  // we can return them there after Save or Cancel.
  const savedScrollYRef = useRef<number | null>(null);
  // Snapshot of form values at the moment edit started, used to detect
  // unsaved changes when the user clicks Cancel.
  type FormSnapshot = {
    name: string;
    cadence: number;
    useAllKeywords: boolean;
    limitMode: LimitMode;
    untilDate: string;
    maxRuns: number;
    continuousIntervalSec: number;
    emptyRunsThreshold: number;
    filterMode: "include" | "exclude";
    editKeywordIds: string[];
  };
  const editSnapshotRef = useRef<FormSnapshot | null>(null);

  function currentFormSnapshot(): FormSnapshot {
    return {
      name,
      cadence,
      useAllKeywords,
      limitMode,
      untilDate,
      maxRuns,
      continuousIntervalSec,
      emptyRunsThreshold,
      filterMode,
      editKeywordIds: [...editKeywordIds].sort(),
    };
  }

  function hasUnsavedEdits(): boolean {
    const snap = editSnapshotRef.current;
    if (!snap) return false;
    const cur = currentFormSnapshot();
    const normSnap = { ...snap, editKeywordIds: [...snap.editKeywordIds].sort() };
    return JSON.stringify(normSnap) !== JSON.stringify(cur);
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setCadence(24);
    setUseAllKeywords(false);
    setLimitMode("forever");
    setUntilDate("");
    setMaxRuns(10);
    setContinuousIntervalSec(60);
    setEmptyRunsThreshold(2);
    setFilterMode("include");
    setEditKeywordIds([]);
    editSnapshotRef.current = null;
    // Restore the scroll position captured when edit started.
    const y = savedScrollYRef.current;
    if (y != null) {
      savedScrollYRef.current = null;
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, behavior: "smooth" });
      });
    }
  }

  function handleCancelEdit() {
    if (hasUnsavedEdits()) {
      const ok = window.confirm("You have unsaved changes. Discard them?");
      if (!ok) return;
    }
    resetForm();
  }

  function startEdit(s: ScheduleRow) {
    // Capture current scroll position only on the first edit-open (don't
    // overwrite if already editing and user clicks edit on another row).
    if (savedScrollYRef.current == null) {
      savedScrollYRef.current = window.scrollY;
    }
    setEditingId(s.id);
    setName(s.name);
    setCadence(s.cadence_hours);
    setUseAllKeywords(!!s.use_all_keywords);
    const kwIds = s.keyword_ids ?? [];
    setEditKeywordIds(kwIds);
    setContinuousIntervalSec(s.continuous_interval_seconds ?? 60);
    setEmptyRunsThreshold(s.empty_runs_threshold ?? 2);
    const nextFilterMode: "include" | "exclude" =
      s.keyword_filter_mode === "exclude" ? "exclude" : "include";
    setFilterMode(nextFilterMode);
    let nextLimitMode: LimitMode;
    let nextUntilDate = "";
    let nextMaxRuns = 10;
    if (s.continuous_mode) {
      nextLimitMode = "continuous";
    } else if (s.expires_at) {
      nextLimitMode = "until";
      nextUntilDate = new Date(s.expires_at).toISOString().slice(0, 10);
    } else if (s.max_runs) {
      nextLimitMode = "runs";
      nextMaxRuns = s.max_runs;
    } else {
      nextLimitMode = "forever";
    }
    setLimitMode(nextLimitMode);
    setUntilDate(nextUntilDate);
    setMaxRuns(nextMaxRuns);
    // Snapshot the values we just set so we can detect unsaved edits later.
    editSnapshotRef.current = {
      name: s.name,
      cadence: s.cadence_hours,
      useAllKeywords: !!s.use_all_keywords,
      limitMode: nextLimitMode,
      untilDate: nextUntilDate,
      maxRuns: nextMaxRuns,
      continuousIntervalSec: s.continuous_interval_seconds ?? 60,
      emptyRunsThreshold: s.empty_runs_threshold ?? 2,
      filterMode: nextFilterMode,
      editKeywordIds: [...kwIds].sort(),
    };
    // Bring the form into view so the user sees their edit immediately.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const isContinuous = limitMode === "continuous";
      const effectiveUseAll = useAllKeywords || isContinuous;
      // Continuous mode is sweep-all-with-no-filter; force include mode.
      const effectiveFilterMode: "include" | "exclude" = isContinuous ? "include" : filterMode;
      // In exclude mode the keyword_ids are the *exclusion* list and we keep them
      // even when sweeping all. In include mode they are the inclusion list and
      // are dropped when sweeping all.
      const keyword_ids =
        effectiveFilterMode === "exclude"
          ? editingId
            ? editKeywordIds
            : currentSelection
          : effectiveUseAll
          ? []
          : editingId
          ? editKeywordIds
          : currentSelection;
      const expires_at =
        limitMode === "until" && untilDate
          ? new Date(`${untilDate}T23:59:59`).toISOString()
          : null;
      const max_runs = limitMode === "runs" ? maxRuns : null;
      return upsertKeywordSchedule({
        data: {
          id: editingId ?? undefined,
          name: name.trim(),
          cadence_hours: cadence,
          keyword_ids,
          keyword_limit: keywordLimit,
          skip_weight_normalization: skipWeight,
          enabled: true,
          use_all_keywords: effectiveUseAll,
          keyword_filter_mode: effectiveFilterMode,
          expires_at,
          max_runs,
          continuous_mode: isContinuous,
          stop_when_no_new_items: true,
          empty_runs_threshold: emptyRunsThreshold,
          continuous_interval_seconds: continuousIntervalSec,
        },
      });
    },
    onSuccess: () => {
      toast.success(editingId ? "Schedule updated" : "Schedule created");
      resetForm();
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keyword-schedules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const toggleMut = useMutation({
    mutationFn: (s: ScheduleRow) =>
      upsertKeywordSchedule({
        data: {
          id: s.id,
          name: s.name,
          cadence_hours: s.cadence_hours,
          keyword_ids: s.keyword_ids ?? [],
          keyword_limit: s.keyword_limit,
          skip_weight_normalization: s.skip_weight_normalization,
          enabled: !s.enabled,
          use_all_keywords: !!s.use_all_keywords,
          keyword_filter_mode: s.keyword_filter_mode === "exclude" ? "exclude" : "include",
          expires_at: s.expires_at ?? null,
          max_runs: s.max_runs ?? null,
          continuous_mode: !!s.continuous_mode,
          stop_when_no_new_items: s.stop_when_no_new_items ?? true,
          empty_runs_threshold: s.empty_runs_threshold ?? 2,
          continuous_interval_seconds: s.continuous_interval_seconds ?? 60,
        },
      }),
    onMutate: async (s: ScheduleRow) => {
      const key = ["pricing-v2", "keyword-schedules"];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ rows: ScheduleRow[] }>(key);
      if (previous?.rows) {
        qc.setQueryData<{ rows: ScheduleRow[] }>(key, {
          ...previous,
          rows: previous.rows.map((r) =>
            r.id === s.id ? { ...r, enabled: !s.enabled } : r,
          ),
        });
      }
      return { previous };
    },
    onError: (e: any, _s, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["pricing-v2", "keyword-schedules"], ctx.previous);
      }
      toast.error(e?.message ?? "Update failed");
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keyword-schedules"] }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteKeywordSchedule({ data: { id } }),
    onSuccess: () => {
      toast.success("Schedule removed");
      if (editingId) resetForm();
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keyword-schedules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const handleStart = (s: ScheduleRow) => {
    // Capture the baseline last_run_at NOW so the watcher can detect when the
    // server records a fresh completion.
    setRunStatusMap((prev) => ({
      ...prev,
      [s.id]: {
        startedAt: Date.now(),
        baselineLastRunAt: s.last_run_at ?? null,
        phase: "queued",
      },
    }));
    runNowMut.mutate(s.id);
  };

  const runNowMut = useMutation({
    mutationFn: (id: string) => runKeywordScheduleNow({ data: { id } }),
    onSuccess: (_data, id) => {
      toast.success("Queued — will run on the next cron tick (within ~1 min)");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keyword-schedules"] });
      // Confirm queued (already set optimistically by handleStart).
      setRunStatusMap((prev) =>
        prev[id]?.phase === "queued" ? prev : { ...prev, [id]: { ...(prev[id] ?? { startedAt: Date.now(), baselineLastRunAt: null, phase: "queued" }) } },
      );
    },
    onError: (e: any, id) => {
      toast.error(e?.message ?? "Failed to start schedule");
      setRunStatusMap((prev) => ({
        ...prev,
        [id]: {
          startedAt: prev[id]?.startedAt ?? Date.now(),
          baselineLastRunAt: prev[id]?.baselineLastRunAt ?? null,
          phase: "failed",
          endedAt: Date.now(),
          error: e?.message ?? "Failed to start",
        },
      }));
    },
  });

  const list = schedules.data?.rows ?? [];
  const kwById = new Map(rows.map((r) => [r.id, r.keyword]));
  const enabledCount = rows.filter((r) => r.enabled).length;
  const selectedIdsForForm = editingId ? editKeywordIds : currentSelection;
  const isContinuousMode = limitMode === "continuous";
  const isExcludeMode = filterMode === "exclude" && !isContinuousMode;
  const effectiveKeywordCount = isExcludeMode
    ? Math.max(0, enabledCount - selectedIdsForForm.length)
    : useAllKeywords
    ? enabledCount
    : selectedIdsForForm.length;
  // ---- Validation ---------------------------------------------------------
  const validationErrors: Record<string, string> = {};
  if (!name.trim()) validationErrors.name = "Name is required.";
  else if (name.trim().length > 120) validationErrors.name = "Name must be 120 characters or fewer.";
  if (!Number.isFinite(cadence) || cadence < 1 || cadence > 24 * 30) {
    validationErrors.cadence = "Cadence must be between 1 and 720 hours.";
  }
  if (!useAllKeywords && !isContinuousMode && !isExcludeMode && effectiveKeywordCount === 0) {
    validationErrors.keywords = "Select at least one keyword, or enable Sweep all.";
  }
  if (limitMode === "until") {
    if (!untilDate) {
      validationErrors.until = "Pick a date when 'Until date' is selected.";
    } else {
      const parsed = new Date(`${untilDate}T23:59:59`);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (Number.isNaN(parsed.getTime())) validationErrors.until = "Invalid date.";
      else if (parsed < today) validationErrors.until = "Date must be today or in the future.";
    }
  }
  if (limitMode === "runs") {
    if (!Number.isFinite(maxRuns) || !Number.isInteger(maxRuns)) {
      validationErrors.runs = "Enter a whole number of runs.";
    } else if (maxRuns < 1) validationErrors.runs = "Must be at least 1 run.";
    else if (maxRuns > 100000) validationErrors.runs = "Maximum is 100,000 runs.";
  }
  if (limitMode === "continuous") {
    if (!Number.isFinite(continuousIntervalSec) || continuousIntervalSec < 10 || continuousIntervalSec > 3600) {
      validationErrors.continuousInterval = "Gap must be 10–3600 seconds.";
    }
    if (!Number.isFinite(emptyRunsThreshold) || !Number.isInteger(emptyRunsThreshold) || emptyRunsThreshold < 1 || emptyRunsThreshold > 50) {
      validationErrors.emptyRuns = "Empty-run threshold must be a whole number 1–50.";
    }
  }
  const canSave = Object.keys(validationErrors).length === 0 && !saveMut.isPending;

  const handleSaveClick = () => {
    if (Object.keys(validationErrors).length > 0) {
      toast.error(Object.values(validationErrors)[0]);
      return;
    }
    saveMut.mutate();
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 justify-between">
          <span className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4" /> Recurring sweep schedules
          </span>
          <NotificationsBell />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Schedules are checked hourly and run automatically. Each schedule remembers
          the keyword set, hits-per-keyword, and skip-weight setting captured when it was saved.
        </p>

        {/* Form */}
        <div ref={formRef} className="rounded-md border p-4 space-y-4 bg-muted/20 scroll-mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-medium">
              {editingId ? "Edit schedule" : "New schedule"}
            </div>
            {editingId && (
              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                <XIcon className="w-3 h-3" /> Cancel edit
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="sched-name">Name</Label>
              <Input
                id="sched-name"
                placeholder="e.g. Daily produce + dairy"
                className="w-64"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sched-cadence">Cadence (hours)</Label>
              <Input
                id="sched-cadence"
                type="number"
                min={1}
                max={720}
                className="w-28"
                value={cadence}
                onChange={(e) => setCadence(Math.max(1, Math.min(720, Number(e.target.value) || 24)))}
              />
              <p className="text-[10px] text-muted-foreground">24 = daily · 168 = weekly</p>
            </div>
          </div>

          {/* Keyword scope toggle */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch
                id="all-kw"
                checked={useAllKeywords || isContinuousMode}
                onCheckedChange={setUseAllKeywords}
                disabled={isContinuousMode}
              />
              <Label htmlFor="all-kw" className="text-sm">
                Sweep <strong>all enabled keywords</strong> in the library (no filter)
              </Label>
            </div>

            {/* Include / Exclude mode — only meaningful when sweeping all */}
            {(useAllKeywords || isContinuousMode) && !isContinuousMode && (
              <div className="flex flex-wrap items-center gap-3 pl-7">
                <span className="text-xs text-muted-foreground">Filter mode:</span>
                <label className="inline-flex items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    name="filter-mode"
                    checked={filterMode === "include"}
                    onChange={() => setFilterMode("include")}
                  />
                  No exclusions (all enabled)
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    name="filter-mode"
                    checked={filterMode === "exclude"}
                    onChange={() => setFilterMode("exclude")}
                  />
                  Exclude selected keywords
                </label>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {isContinuousMode ? (
                <>Continuous mode always sweeps every enabled keyword (currently {enabledCount}).</>
              ) : isExcludeMode ? (
                <>
                  Will sweep all enabled keywords <strong>except</strong> the {selectedIdsForForm.length} keyword
                  {selectedIdsForForm.length === 1 ? "" : "s"}{" "}
                  {editingId ? "captured when saved" : "currently selected above"} (~{effectiveKeywordCount} will run).
                </>
              ) : useAllKeywords ? (
                <>Will run against every enabled keyword at the time the schedule fires (currently {effectiveKeywordCount}).</>
              ) : editingId ? (
                <>Locked to the {editKeywordIds.length} keyword{editKeywordIds.length === 1 ? "" : "s"} captured when saved. Re-save while editing to refresh.</>
              ) : (
                <>Will use your current selection above ({currentSelection.length} keyword{currentSelection.length === 1 ? "" : "s"}).</>
              )}
            </p>
          </div>

          {/* Run-until / max-runs toggle */}
          <div className="space-y-2">
            <Label className="text-sm">Run for how long?</Label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="limit-mode"
                  checked={limitMode === "forever"}
                  onChange={() => setLimitMode("forever")}
                />
                Forever (until disabled)
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="limit-mode"
                  checked={limitMode === "until"}
                  onChange={() => setLimitMode("until")}
                />
                Until date
              </label>
              {limitMode === "until" && (
                <Input
                  type="date"
                  className="w-44"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  aria-invalid={!!validationErrors.until}
                />
              )}
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="limit-mode"
                  checked={limitMode === "runs"}
                  onChange={() => setLimitMode("runs")}
                />
                For N runs
              </label>
              {limitMode === "runs" && (
                <Input
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={1}
                  max={100000}
                  className="w-24"
                  value={maxRuns}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    setMaxRuns(Math.max(1, Math.min(100000, Math.floor(n))));
                  }}
                  aria-invalid={!!validationErrors.runs}
                />
              )}
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="limit-mode"
                  checked={limitMode === "continuous"}
                  onChange={() => setLimitMode("continuous")}
                />
                Continuous (until catalog complete)
              </label>
            </div>
            {isContinuousMode && (
              <div className="rounded-md border border-dashed bg-background p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Runs back-to-back across <strong>all enabled keywords</strong>. After each run finishes,
                  the next one starts ~{continuousIntervalSec}s later. When {emptyRunsThreshold} consecutive
                  runs add no new items to the catalog, the schedule auto-disables.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Gap between runs (seconds)</Label>
                    <Input
                      type="number"
                      min={10}
                      max={3600}
                      className="w-28"
                      value={continuousIntervalSec}
                      onChange={(e) =>
                        setContinuousIntervalSec(
                          Math.max(10, Math.min(3600, Number(e.target.value) || 60))
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Stop after N empty runs</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      className="w-24"
                      value={emptyRunsThreshold}
                      onChange={(e) =>
                        setEmptyRunsThreshold(Math.max(1, Math.min(50, Number(e.target.value) || 2)))
                      }
                    />
                  </div>
                </div>
              </div>
            )}
            {(validationErrors.until || validationErrors.runs || validationErrors.continuousInterval || validationErrors.emptyRuns) && (
              <p className="text-xs text-destructive">
                {validationErrors.until || validationErrors.runs || validationErrors.continuousInterval || validationErrors.emptyRuns}
              </p>
            )}
          </div>

          {(validationErrors.name || validationErrors.cadence || validationErrors.keywords) && (
            <p className="text-xs text-destructive">
              {validationErrors.name || validationErrors.cadence || validationErrors.keywords}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveClick}
              disabled={!canSave}
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? "Save changes" : "Save schedule"}
            </Button>
          </div>
        </div>

        {/* List */}
        {schedules.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No schedules yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((s) => {
              const sample = (s.keyword_ids ?? []).slice(0, 4).map((id) => kwById.get(id) ?? id.slice(0, 6));
              const more = Math.max(0, (s.keyword_ids ?? []).length - sample.length);
              const isEditing = editingId === s.id;
              const isStarting = runNowMut.isPending && runNowMut.variables === s.id;
              const runStatus = runStatusMap[s.id];
              return (
                <div
                  key={s.id}
                  id={`schedule-${s.id}`}
                  className={`rounded-lg border bg-card p-3 flex flex-col gap-3 transition-all scroll-mt-4 ${
                    isEditing ? "border-primary ring-1 ring-primary/40" : ""
                  } ${!s.enabled ? "opacity-70" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        every {s.cadence_hours}h
                        {s.cadence_hours === 24 ? " · daily" : s.cadence_hours === 168 ? " · weekly" : ""}
                      </div>
                    </div>
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={() => toggleMut.mutate(s)}
                      disabled={toggleMut.isPending}
                      aria-label={s.enabled ? "Disable schedule" : "Enable schedule"}
                    />
                  </div>

                  <div className="text-[11px] space-y-1">
                    <div className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">
                      Scope
                    </div>
                    {s.use_all_keywords ? (
                      s.keyword_filter_mode === "exclude" && (s.keyword_ids ?? []).length > 0 ? (
                        <>
                          <Badge variant="secondary">All enabled · excl {(s.keyword_ids ?? []).length}</Badge>
                          <div className="text-muted-foreground truncate">
                            excl: {sample.join(", ")}
                            {more > 0 && <> +{more}</>}
                          </div>
                        </>
                      ) : (
                        <Badge variant="secondary">All enabled keywords</Badge>
                      )
                    ) : (
                      <div className="truncate">
                        <span className="text-muted-foreground">{(s.keyword_ids ?? []).length}: </span>
                        {sample.join(", ")}
                        {more > 0 && <span className="text-muted-foreground"> +{more}</span>}
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] space-y-1">
                    <div className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">
                      Limit
                    </div>
                    {s.continuous_mode ? (
                      <>
                        <Badge variant="secondary">Continuous</Badge>
                        <div className="text-muted-foreground">
                          ~{s.continuous_interval_seconds ?? 60}s · stops after {s.empty_runs_threshold ?? 2} empty
                          {(s.consecutive_empty_runs ?? 0) > 0 && (
                            <> ({s.consecutive_empty_runs}/{s.empty_runs_threshold ?? 2})</>
                          )}
                        </div>
                      </>
                    ) : s.expires_at ? (
                      <span>until {new Date(s.expires_at).toLocaleDateString()}</span>
                    ) : s.max_runs ? (
                      <span>{s.run_count ?? 0} / {s.max_runs} runs</span>
                    ) : (
                      <span className="text-muted-foreground">forever</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">
                        Last run
                      </div>
                      <div className="text-muted-foreground">
                        {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : "—"}
                      </div>
                      {s.last_run_id && (
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {s.last_run_id.slice(0, 8)}…
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">
                        Next run
                      </div>
                      <div className="text-muted-foreground">
                        {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : "—"}
                      </div>
                    </div>
                  </div>

                  {runStatus && <RunStatusRow status={runStatus} />}

                  <div className="flex items-center justify-end gap-1 pt-1 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => handleStart(s)}
                      disabled={runNowMut.isPending}
                      title="Run on the next cron tick"
                    >
                      {isStarting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      Start
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => startEdit(s)}
                      title="Edit"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete schedule "${s.name}"?`)) delMut.mutate(s.id);
                      }}
                      disabled={delMut.isPending}
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----- Notifications bell ---------------------------------------------------

function NotificationsBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ScheduleNotification | null>(null);
  const notifs = useQuery({
    queryKey: ["pricing-v2", "schedule-notifications"],
    queryFn: () => listScheduleNotifications({ data: { limit: 50, unread_only: false } }),
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (vars: { ids?: string[]; all?: boolean }) =>
      markScheduleNotificationsRead({ data: { ids: vars.ids, all: !!vars.all } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing-v2", "schedule-notifications"] }),
  });
  const clearRead = useMutation({
    mutationFn: () => clearScheduleNotifications({ data: { only_read: true } }),
    onSuccess: (r) => {
      toast.success(`Cleared ${r.deleted} read notification${r.deleted === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "schedule-notifications"] });
    },
  });

  const unread = notifs.data?.unread_count ?? 0;
  const rows = notifs.data?.rows ?? [];

  const openDetail = (n: ScheduleNotification) => {
    setDetail(n);
    setOpen(false);
    if (!n.read_at) markRead.mutate({ ids: [n.id] });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="relative h-8 w-8 p-0" aria-label="Schedule notifications">
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="text-sm font-medium">
              Notifications {unread > 0 && <span className="text-muted-foreground font-normal">· {unread} unread</span>}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => markRead.mutate({ all: true })}
                disabled={markRead.isPending || unread === 0}
                title="Mark all as read"
              >
                <CheckCheck className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => clearRead.mutate()}
                disabled={clearRead.isPending || rows.every((r) => !r.read_at)}
                title="Clear read notifications"
              >
                <Eraser className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div className="max-h-96 overflow-auto divide-y">
            {notifs.isLoading ? (
              <p className="p-4 text-xs text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">No notifications yet.</p>
            ) : (
              rows.map((n: ScheduleNotification) => {
                const isUnread = !n.read_at;
                const dot =
                  n.severity === "error"
                    ? "bg-destructive"
                    : n.severity === "warning"
                    ? "bg-yellow-500"
                    : n.severity === "success"
                    ? "bg-green-500"
                    : "bg-muted-foreground";
                return (
                  <button
                    key={n.id}
                    onClick={() => openDetail(n)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-muted/50 ${
                      isUnread ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 inline-block w-2 h-2 rounded-full shrink-0 ${dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{n.title}</div>
                        {n.message && (
                          <div className="text-[11px] text-muted-foreground line-clamp-2">{n.message}</div>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(n.created_at).toLocaleString()}
                          {n.run_id && (
                            <span className="font-mono ml-1">· {n.run_id.slice(0, 8)}…</span>
                          )}
                        </div>
                      </div>
                      <Info className="w-3 h-3 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      <NotificationDetailDialog
        notification={detail}
        onOpenChange={(o) => !o && setDetail(null)}
      />
    </>
  );
}

// ----- Notification detail modal --------------------------------------------

function NotificationDetailDialog({
  notification: n,
  onOpenChange,
}: {
  notification: ScheduleNotification | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!n;
  const qc = useQueryClient();

  // Look up the related schedule (if any) so we can show the right actions
  // (e.g. only show "Disable" when the schedule is currently enabled).
  const schedules = useQuery({
    queryKey: ["pricing-v2", "keyword-schedules"],
    queryFn: () => listKeywordSchedules(),
    staleTime: 30_000,
  });
  const relatedSchedule = useMemo(
    () =>
      n?.schedule_id
        ? (schedules.data?.rows ?? []).find((s) => s.id === n.schedule_id) ?? null
        : null,
    [schedules.data, n?.schedule_id],
  );

  const retryMut = useMutation({
    mutationFn: (id: string) => runKeywordScheduleNow({ data: { id } }),
    onSuccess: () => {
      toast.success("Retry queued — will run on the next cron tick (within ~1 min)");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keyword-schedules"] });
      qc.invalidateQueries({ queryKey: ["pricing-v2", "schedule-notifications"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to retry schedule"),
  });

  const disableMut = useMutation({
    mutationFn: (s: ScheduleRow) =>
      upsertKeywordSchedule({
        data: {
          id: s.id,
          name: s.name,
          cadence_hours: s.cadence_hours,
          keyword_ids: s.keyword_ids ?? [],
          keyword_limit: s.keyword_limit,
          skip_weight_normalization: s.skip_weight_normalization,
          enabled: false,
          use_all_keywords: !!s.use_all_keywords,
          keyword_filter_mode: s.keyword_filter_mode === "exclude" ? "exclude" : "include",
          expires_at: s.expires_at ?? null,
          max_runs: s.max_runs ?? null,
          continuous_mode: !!s.continuous_mode,
          stop_when_no_new_items: s.stop_when_no_new_items ?? true,
          empty_runs_threshold: s.empty_runs_threshold ?? 2,
          continuous_interval_seconds: s.continuous_interval_seconds ?? 60,
        },
      }),
    onSuccess: () => {
      toast.success("Schedule disabled");
      qc.invalidateQueries({ queryKey: ["pricing-v2", "keyword-schedules"] });
      qc.invalidateQueries({ queryKey: ["pricing-v2", "schedule-notifications"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to disable schedule"),
  });

  const severityBadge = (sev: ScheduleNotification["severity"]) => {
    const variant: Record<typeof sev, string> = {
      error: "bg-destructive text-destructive-foreground",
      warning: "bg-yellow-500 text-white",
      success: "bg-green-500 text-white",
      info: "bg-muted text-foreground",
    } as any;
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${variant[sev]}`}>
        {sev}
      </span>
    );
  };

  const eventLabel = (et: ScheduleNotification["event_type"]) =>
    et === "auto_disabled" ? "Auto-disabled" : et === "run_error" ? "Run failed" : "Run succeeded";

  // Pull common metadata fields if present
  const meta = (n?.metadata ?? {}) as Record<string, any>;
  const errorMessage: string | undefined =
    meta.error_message ?? meta.error ?? meta.last_error ?? (n?.severity === "error" ? n?.message ?? undefined : undefined);
  const reason: string | undefined = meta.reason ?? meta.disabled_reason;
  const knownKeys = new Set(["error_message", "error", "last_error", "reason", "disabled_reason"]);
  const otherMeta = Object.entries(meta).filter(([k]) => !knownKeys.has(k));

  const copyJson = async () => {
    if (!n) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(n, null, 2));
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const goToSchedule = () => {
    if (!n?.schedule_id) return;
    const id = n.schedule_id;
    onOpenChange(false);
    // Wait for the dialog to unmount so scrolling targets the actual page.
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById(`schedule-${id}`);
        if (!el) {
          toast.error("Schedule not found on this page (it may have been deleted).");
          return;
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Brief flash so the user sees which card it is.
        el.classList.add("ring-2", "ring-primary", "ring-offset-2");
        window.setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
        }, 2000);
      }, 50);
    });
  };

  const handleRetry = () => {
    if (!n?.schedule_id) return;
    retryMut.mutate(n.schedule_id);
  };
  const handleDisable = () => {
    if (!relatedSchedule) {
      toast.error("Schedule not found — it may have been deleted.");
      return;
    }
    disableMut.mutate(relatedSchedule);
  };

  // Show Retry only for run failures (and we need a schedule_id to retry).
  const canRetry = !!n && n.event_type === "run_error" && !!n.schedule_id;
  // Show Disable for auto-disable/run-error events when the schedule is still enabled.
  const isActionableEvent = !!n && (n.event_type === "run_error" || n.event_type === "auto_disabled");
  const canDisable =
    isActionableEvent && !!relatedSchedule && relatedSchedule.enabled === true;
  // If the schedule is already disabled (common after auto_disabled), surface that too.
  const alreadyDisabled =
    isActionableEvent && !!relatedSchedule && relatedSchedule.enabled === false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {n && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 flex-wrap">
                {severityBadge(n.severity)}
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  {eventLabel(n.event_type)}
                </span>
              </div>
              <DialogTitle className="text-base">{n.title}</DialogTitle>
              {n.message && <DialogDescription>{n.message}</DialogDescription>}
            </DialogHeader>

            <div className="space-y-4 text-xs">
              {/* Run metadata */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <MetaField label="Schedule">
                  {n.schedule_id ? (
                    <button
                      type="button"
                      onClick={goToSchedule}
                      className="text-primary hover:underline truncate text-left"
                      title="Jump to this schedule"
                    >
                      {n.schedule_name ?? n.schedule_id.slice(0, 8) + "…"}
                    </button>
                  ) : (
                    n.schedule_name ?? <span className="text-muted-foreground">—</span>
                  )}
                </MetaField>
                <MetaField label="Created">
                  {new Date(n.created_at).toLocaleString()}
                </MetaField>
                <MetaField label="Schedule ID">
                  <span className="font-mono text-[11px] break-all">
                    {n.schedule_id ?? "—"}
                  </span>
                </MetaField>
                <MetaField label="Run ID">
                  <span className="font-mono text-[11px] break-all">
                    {n.run_id ?? "—"}
                  </span>
                </MetaField>
                <MetaField label="Status">
                  {n.read_at ? `Read ${new Date(n.read_at).toLocaleString()}` : "Unread"}
                </MetaField>
                <MetaField label="Notification ID">
                  <span className="font-mono text-[11px] break-all">{n.id}</span>
                </MetaField>
              </div>

              {/* Reason (auto-disable) */}
              {reason && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                    Reason
                  </div>
                  <div className="rounded border bg-muted/40 p-2 text-foreground whitespace-pre-wrap">
                    {String(reason)}
                  </div>
                </div>
              )}

              {/* Error message */}
              {errorMessage && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                    Error message
                  </div>
                  <pre className="rounded border bg-destructive/5 border-destructive/20 p-2 text-[11px] text-destructive-foreground whitespace-pre-wrap break-words max-h-64 overflow-auto">
                    {String(errorMessage)}
                  </pre>
                </div>
              )}

              {/* Additional metadata */}
              {otherMeta.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                    Run metadata
                  </div>
                  <div className="rounded border bg-muted/30 divide-y">
                    {otherMeta.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-3 gap-2 px-2 py-1.5">
                        <div className="text-muted-foreground font-mono text-[11px]">{k}</div>
                        <div className="col-span-2 font-mono text-[11px] break-all whitespace-pre-wrap">
                          {typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!errorMessage && !reason && otherMeta.length === 0 && (
                <p className="text-muted-foreground italic">No additional metadata.</p>
              )}
            </div>

            {(canRetry || canDisable || alreadyDisabled) && (
              <div className="rounded-md border bg-muted/30 p-2 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold uppercase text-muted-foreground mr-1">
                  Quick actions
                </span>
                {canRetry && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleRetry}
                    disabled={retryMut.isPending}
                    className="gap-1"
                    title="Re-queue this schedule for the next cron tick"
                  >
                    <RefreshCw className={`w-3 h-3 ${retryMut.isPending ? "animate-spin" : ""}`} />
                    {retryMut.isPending ? "Retrying…" : "Retry run"}
                  </Button>
                )}
                {canDisable && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDisable}
                    disabled={disableMut.isPending}
                    className="gap-1"
                    title="Turn this schedule off so it stops running"
                  >
                    <PowerOff className="w-3 h-3" />
                    {disableMut.isPending ? "Disabling…" : "Disable schedule"}
                  </Button>
                )}
                {alreadyDisabled && (
                  <span className="text-[11px] text-muted-foreground italic">
                    Schedule is currently disabled.
                  </span>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                size="sm"
                variant="secondary"
                onClick={goToSchedule}
                disabled={!n.schedule_id}
                className="gap-1"
                title={n.schedule_id ? "Jump to this schedule" : "No related schedule"}
              >
                <ArrowDownToLine className="w-3 h-3" />
                Go to schedule
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyJson}>
                  Copy JSON
                </Button>
                <Button size="sm" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RunStatusRow({
  status,
}: {
  status: {
    startedAt: number;
    phase: "queued" | "running" | "completed" | "failed";
    endedAt?: number;
    error?: string;
  };
}) {
  // Recompute elapsed every render (the parent ticks 1Hz while active runs exist).
  const endRef = status.endedAt ?? Date.now();
  const elapsedMs = Math.max(0, endRef - status.startedAt);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const mm = Math.floor(elapsedSec / 60);
  const ss = elapsedSec % 60;
  const elapsedLabel = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
  const startedLabel = new Date(status.startedAt).toLocaleTimeString();

  const tone =
    status.phase === "failed"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : status.phase === "completed"
      ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
      : status.phase === "running"
      ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400"
      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";

  const label =
    status.phase === "queued"
      ? "Queued"
      : status.phase === "running"
      ? "Running"
      : status.phase === "completed"
      ? "Completed"
      : "Failed";

  const Icon =
    status.phase === "completed"
      ? CheckCheck
      : status.phase === "failed"
      ? XIcon
      : Loader2;
  const spin = status.phase === "queued" || status.phase === "running";

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] ${tone}`}
      role="status"
      aria-live="polite"
    >
      <Icon className={`w-3 h-3 shrink-0 ${spin ? "animate-spin" : ""}`} />
      <span className="font-semibold uppercase tracking-wide">{label}</span>
      <span className="opacity-80 tabular-nums">
        · {elapsedLabel}
      </span>
      <span className="opacity-60 ml-auto tabular-nums">started {startedLabel}</span>
      {status.phase === "failed" && status.error && (
        <span className="basis-full text-[10px] opacity-80 break-words">{status.error}</span>
      )}
    </div>
  );
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

