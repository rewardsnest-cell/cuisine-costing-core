import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listFredMappings,
  testFredSeries,
  suggestFredMappings,
  upsertFredMapping,
  deleteFredMapping,
} from "@/lib/server-fns/fred-mappings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Search,
  Plus,
  Sparkles,
  FlaskConical,
  Trash2,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertCircle,
  ChevronsUpDown,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mapping = Awaited<ReturnType<typeof listFredMappings>>["mappings"][number];

type Reference = { id: string; canonical_name: string; default_unit: string };

const UNITS = [
  "lb",
  "oz",
  "kg",
  "g",
  "each",
  "dozen",
  "gallon",
  "quart",
  "pint",
  "cup",
  "ml",
  "l",
  "bunch",
  "head",
  "package",
];

interface Props {
  references: Reference[];
  /** Called whenever a mapping is saved or deleted, so parent can refresh related views. */
  onChanged?: () => void;
}

export function FredMappingsManager({ references, onChanged }: Props) {
  const listFn = useServerFn(listFredMappings);
  const suggestFn = useServerFn(suggestFredMappings);
  const upsertFn = useServerFn(upsertFredMapping);
  const deleteFn = useServerFn(deleteFredMapping);

  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [observations, setObservations] = useState<
    Record<string, { date: string; value: number; converted: number } | null>
  >({});
  const [lastPullAt, setLastPullAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Add/Edit dialog
  const [editing, setEditing] = useState<Mapping | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Suggest dialog
  const [showSuggest, setShowSuggest] = useState(false);

  const refMap = useMemo(() => {
    const m = new Map<string, Reference>();
    references.forEach((r) => m.set(r.id, r));
    return m;
  }, [references]);

  const refresh = async (withObservations = false) => {
    if (withObservations) setRefreshing(true);
    try {
      const res = await listFn({ data: { includeObservations: withObservations } });
      setMappings(res.mappings);
      if (withObservations) setObservations(res.observations);
      setLastPullAt(res.last_pull_at);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load mappings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh(false);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mappings.filter((m) => {
      if (statusFilter === "active" && !m.active) return false;
      if (statusFilter === "inactive" && m.active) return false;
      if (!q) return true;
      return (
        m.series_id.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        (m.linked_reference_name || "").toLowerCase().includes(q) ||
        (m.match_keywords || []).some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [mappings, search, statusFilter]);

  const stats = useMemo(() => {
    const active = mappings.filter((m) => m.active).length;
    const linked = mappings.filter((m) => m.linked_reference_id).length;
    return { total: mappings.length, active, linked };
  }, [mappings]);

  const handleDelete = async (m: Mapping) => {
    if (!confirm(`Delete mapping for ${m.label} (${m.series_id})?`)) return;
    try {
      await deleteFn({ data: { id: m.id } });
      toast.success("Mapping deleted");
      await refresh(false);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  };

  return (
    <Card className="shadow-warm border-border/50">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display text-xl flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-primary" />
              FRED Series Mapping
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Connect Federal Reserve / BLS price series to your ingredients. Primary
              mappings are used first; fallback mappings cover gaps.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={refreshing}>
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", refreshing && "animate-spin")} />
              {refreshing ? "Loading prices…" : "Load latest prices"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSuggest(true)}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Bulk suggest
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              className="bg-gradient-warm text-primary-foreground"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add mapping
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            <span className="text-foreground font-medium tabular-nums">{stats.total}</span> total
          </span>
          <span>·</span>
          <span>
            <span className="text-foreground font-medium tabular-nums">{stats.active}</span> active
          </span>
          <span>·</span>
          <span>
            <span className="text-foreground font-medium tabular-nums">{stats.linked}</span> linked
            to ingredient
          </span>
          {lastPullAt && (
            <>
              <span>·</span>
              <span>last pull {new Date(lastPullAt).toLocaleDateString()}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by series ID, label, ingredient, or keyword…"
              className="pl-9 h-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading mappings…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            {mappings.length === 0
              ? "No mappings yet. Click Add mapping to get started."
              : "No mappings match your filters."}
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2.5">Series</th>
                    <th className="text-left px-3 py-2.5">Linked ingredient</th>
                    <th className="text-right px-3 py-2.5">Latest FRED</th>
                    <th className="text-left px-3 py-2.5">Observed</th>
                    <th className="text-left px-3 py-2.5">Status</th>
                    <th className="text-right px-3 py-2.5 w-[1%]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const obs = observations[m.series_id];
                    return (
                      <tr key={m.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{m.label}</div>
                          <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
                            {m.series_id}
                            <a
                              href={`https://fred.stlouisfed.org/series/${m.series_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center"
                              title="Open on FRED"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          {m.priority === "fallback" && (
                            <Badge variant="outline" className="mt-1 text-[10px] py-0 px-1.5">
                              fallback
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {m.linked_reference_name ? (
                            <span className="text-foreground">{m.linked_reference_name}</span>
                          ) : (
                            <span className="text-muted-foreground italic">unlinked</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {obs === undefined ? (
                            <span className="text-muted-foreground">—</span>
                          ) : obs === null ? (
                            <span className="text-destructive text-xs">no data</span>
                          ) : (
                            <span className="font-medium">${obs.converted.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {obs?.date ?? "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge mapping={m} observation={obs ?? undefined} />
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => {
                              setEditing(m);
                              setShowForm(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(m)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>

      <MappingFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        editing={editing}
        references={references}
        refMap={refMap}
        onSaved={async () => {
          setShowForm(false);
          setEditing(null);
          await refresh(false);
          onChanged?.();
        }}
        upsertFn={upsertFn}
      />

      <SuggestDialog
        open={showSuggest}
        onOpenChange={setShowSuggest}
        suggestFn={suggestFn}
        upsertFn={upsertFn}
        onApplied={async () => {
          await refresh(false);
          onChanged?.();
        }}
      />
    </Card>
  );
}

function StatusBadge({
  mapping,
  observation,
}: {
  mapping: Mapping;
  observation?: { date: string; value: number; converted: number } | null;
}) {
  if (!mapping.active) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        inactive
      </Badge>
    );
  }
  if (observation === undefined) {
    return (
      <Badge variant="outline" className="bg-success/10 text-success border-success/30">
        active
      </Badge>
    );
  }
  if (observation === null) {
    return (
      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
        needs update
      </Badge>
    );
  }
  // If observation is older than ~45 days, flag stale.
  const ageDays = (Date.now() - new Date(observation.date).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 45) {
    return (
      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
        stale ({Math.round(ageDays)}d)
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-success/10 text-success border-success/30">
      active
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Add / Edit Dialog                                */
/* -------------------------------------------------------------------------- */

function MappingFormDialog({
  open,
  onOpenChange,
  editing,
  references,
  refMap,
  onSaved,
  upsertFn,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Mapping | null;
  references: Reference[];
  refMap: Map<string, Reference>;
  onSaved: () => void;
  upsertFn: ReturnType<typeof useServerFn<typeof upsertFredMapping>>;
}) {
  const testFn = useServerFn(testFredSeries);

  const [referenceId, setReferenceId] = useState<string>("");
  const [seriesId, setSeriesId] = useState("");
  const [label, setLabel] = useState("");
  const [keywords, setKeywords] = useState("");
  const [unit, setUnit] = useState("lb");
  const [unitConv, setUnitConv] = useState("1");
  const [category, setCategory] = useState("");
  const [active, setActive] = useState(true);
  const [priority, setPriority] = useState<"primary" | "fallback">("primary");
  const [notes, setNotes] = useState("");
  const [refOpen, setRefOpen] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof testFredSeries>> | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTestResult(null);
    if (editing) {
      setReferenceId(editing.linked_reference_id || "");
      setSeriesId(editing.series_id);
      setLabel(editing.label);
      setKeywords((editing.match_keywords || []).join(", "));
      setUnit(editing.unit || "lb");
      setUnitConv(String(editing.unit_conversion || 1));
      setCategory(editing.category || "");
      setActive(editing.active);
      setPriority(editing.priority);
      setNotes(editing.notes || "");
    } else {
      setReferenceId("");
      setSeriesId("");
      setLabel("");
      setKeywords("");
      setUnit("lb");
      setUnitConv("1");
      setCategory("");
      setActive(true);
      setPriority("primary");
      setNotes("");
    }
  }, [open, editing]);

  const handleTest = async () => {
    if (!seriesId.trim()) {
      toast.error("Enter a FRED series ID first");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testFn({
        data: {
          series_id: seriesId.trim(),
          reference_id: referenceId || null,
          unit_conversion: Number(unitConv) || 1,
        },
      });
      setTestResult(res);
      if (!res.ok) toast.error(res.error);
    } catch (e: any) {
      toast.error(e?.message || "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editing?.id,
          series_id: seriesId.trim(),
          label: label.trim(),
          match_keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          unit,
          unit_conversion: Number(unitConv) || 1,
          category: category.trim() || null,
          active,
          priority,
          notes: notes.trim() || null,
          reference_id: referenceId || null,
        },
      });
      toast.success(editing ? "Mapping updated" : "Mapping created");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const selectedRef = referenceId ? refMap.get(referenceId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {editing ? "Edit FRED mapping" : "Add new FRED mapping"}
          </DialogTitle>
          <DialogDescription>
            Link a Federal Reserve / BLS price series to an ingredient. Use Test pull to verify
            before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs">Ingredient</Label>
            <Popover open={refOpen} onOpenChange={setRefOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {selectedRef?.canonical_name || (
                    <span className="text-muted-foreground">Select ingredient…</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search ingredients…" />
                  <CommandList>
                    <CommandEmpty>No ingredient found.</CommandEmpty>
                    <CommandGroup>
                      {references.map((r) => (
                        <CommandItem
                          key={r.id}
                          value={r.canonical_name}
                          onSelect={() => {
                            setReferenceId(r.id);
                            if (!unit || unit === "lb") setUnit(r.default_unit || "lb");
                            setRefOpen(false);
                          }}
                        >
                          {r.canonical_name}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {r.default_unit}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
            <div>
              <Label className="text-xs">FRED series ID</Label>
              <Input
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value.toUpperCase())}
                placeholder="e.g. APU0000703112 for Ground Beef"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Browse series at{" "}
                <a
                  href="https://fred.stlouisfed.org/categories/9"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  fred.stlouisfed.org
                </a>
              </p>
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ground beef (per lb)"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Unit conversion</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={unitConv}
                onChange={(e) => setUnitConv(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Multiplier on FRED value (e.g. 1.0 if FRED is already $/lb)
              </p>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="meat, dairy, produce…"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Match keywords (comma-separated)</Label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="ground beef, beef, hamburger"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Used by the auto-matcher when no explicit ingredient link is set.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} id="map-active" />
              <Label htmlFor="map-active" className="text-xs cursor-pointer">
                Active
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="fallback">Fallback</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* Test pull */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-primary" />
                Test pull
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleTest}
                disabled={testing || !seriesId.trim()}
              >
                {testing ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                )}
                Test pull
              </Button>
            </div>
            {testResult && testResult.ok && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-card border border-border p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    FRED
                  </div>
                  <div className="text-lg font-display font-bold tabular-nums">
                    ${testResult.converted_value.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {testResult.observation_date} · raw ${testResult.observation_value.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-md bg-card border border-border p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Current cost
                  </div>
                  <div className="text-lg font-display font-bold tabular-nums">
                    {testResult.current_cost != null ? (
                      `$${testResult.current_cost.toFixed(2)}`
                    ) : (
                      <span className="text-muted-foreground text-base">—</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                    {testResult.inventory_name ?? "no linked ingredient"}
                    {testResult.pct_change != null && (
                      <span
                        className={cn(
                          "ml-auto inline-flex items-center gap-0.5 font-medium",
                          testResult.pct_change > 1
                            ? "text-warning"
                            : testResult.pct_change < -1
                              ? "text-success"
                              : "text-muted-foreground",
                        )}
                      >
                        {testResult.pct_change > 1 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : testResult.pct_change < -1 ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : (
                          <Minus className="w-3 h-3" />
                        )}
                        {testResult.pct_change > 0 ? "+" : ""}
                        {testResult.pct_change.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {testResult && !testResult.ok && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>{testResult.error}</AlertDescription>
              </Alert>
            )}
            {!testResult && (
              <p className="text-[11px] text-muted-foreground">
                Verifies the series ID is valid and shows the latest value next to the current
                ingredient cost — no data is saved.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !seriesId.trim() || !label.trim()}
            className="bg-gradient-warm text-primary-foreground"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
            )}
            {editing ? "Save changes" : "Create mapping"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Suggest Dialog                                 */
/* -------------------------------------------------------------------------- */

function SuggestDialog({
  open,
  onOpenChange,
  suggestFn,
  upsertFn,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suggestFn: ReturnType<typeof useServerFn<typeof suggestFredMappings>>;
  upsertFn: ReturnType<typeof useServerFn<typeof upsertFredMapping>>;
  onApplied: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Awaited<ReturnType<typeof suggestFredMappings>>["suggestions"]
  >([]);
  const [unmappedTotal, setUnmappedTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setLoading(true);
    suggestFn({ data: { limit: 100 } })
      .then((res) => {
        setSuggestions(res.suggestions);
        setUnmappedTotal(res.total_unmapped);
        // Auto-select high confidence (>= 0.5)
        const auto = new Set<string>();
        for (const s of res.suggestions) if (s.score >= 0.5) auto.add(s.reference_id);
        setSelected(auto);
      })
      .catch((e) => toast.error(e?.message || "Failed to suggest"))
      .finally(() => setLoading(false));
  }, [open, suggestFn]);

  const handleApply = async () => {
    setApplying(true);
    let ok = 0;
    let fail = 0;
    for (const s of suggestions) {
      if (!selected.has(s.reference_id)) continue;
      try {
        await upsertFn({
          data: {
            series_id: s.series_id,
            label: s.label,
            unit: s.unit,
            unit_conversion: s.unit_conversion,
            reference_id: s.reference_id,
            match_keywords: [s.reference_name.toLowerCase()],
            active: true,
            priority: "primary",
          },
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setApplying(false);
    toast.success(`Created ${ok} mapping${ok === 1 ? "" : "s"}${fail ? ` (${fail} failed)` : ""}`);
    onOpenChange(false);
    onApplied();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Bulk suggest mappings
          </DialogTitle>
          <DialogDescription>
            Suggested FRED series for unmapped ingredients, scored by name and synonym overlap.
            Review and select which to create.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Scoring suggestions…
          </div>
        ) : suggestions.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No new suggestions found. {unmappedTotal} ingredients remain unmapped — try adding them
            manually.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {suggestions.length} suggestions · {unmappedTotal} ingredients unmapped overall
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected(new Set(suggestions.map((s) => s.reference_id)))
                  }
                >
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2"></th>
                    <th className="text-left px-3 py-2">Ingredient</th>
                    <th className="text-left px-3 py-2">Suggested series</th>
                    <th className="text-right px-3 py-2">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => {
                    const isSel = selected.has(s.reference_id);
                    return (
                      <tr
                        key={s.reference_id}
                        className="border-b border-border/40 hover:bg-muted/20 cursor-pointer"
                        onClick={() => {
                          const next = new Set(selected);
                          if (next.has(s.reference_id)) next.delete(s.reference_id);
                          else next.add(s.reference_id);
                          setSelected(next);
                        }}
                      >
                        <td className="px-2 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => {}}
                            className="accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2.5">{s.reference_name}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{s.label}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {s.series_id}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{s.reason}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Badge
                            variant="outline"
                            className={cn(
                              s.score >= 0.5
                                ? "bg-success/10 text-success border-success/30"
                                : s.score >= 0.35
                                  ? "bg-warning/10 text-warning border-warning/30"
                                  : "text-muted-foreground",
                            )}
                          >
                            {Math.round(s.score * 100)}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={applying || selected.size === 0}
            className="bg-gradient-warm text-primary-foreground"
          >
            {applying ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
            )}
            Create {selected.size} mapping{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
