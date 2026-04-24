import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Globe, EyeOff, ShieldAlert, Info, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  listFeatureVisibility,
  updateFeatureVisibility,
  VISIBILITY_PHASES,
  type FeatureVisibilityRow,
  type VisibilityPhase,
} from "@/lib/server-fns/feature-visibility.functions";
import { PHASE_LABEL, PHASE_DESCRIPTION, PHASE_BADGE_CLASS } from "@/lib/feature-visibility";
import {
  getFeatureMeta,
  computeStatus,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  STATUS_DESCRIPTION,
  RISK_LABEL,
  RISK_BADGE_CLASS,
  type FeatureCategory,
  type FeatureStatus,
} from "@/lib/feature-catalog";

export const Route = createFileRoute("/admin/visibility")({
  head: () => ({ meta: [{ title: "Feature Visibility — Admin" }] }),
  component: VisibilityPage,
});

type Draft = {
  phase: VisibilityPhase;
  nav_enabled: boolean;
  seo_indexing_enabled: boolean;
  notes: string;
};

function rowToDraft(r: FeatureVisibilityRow): Draft {
  return {
    phase: r.phase,
    nav_enabled: r.nav_enabled,
    seo_indexing_enabled: r.seo_indexing_enabled,
    notes: r.notes ?? "",
  };
}

function isDirty(a: Draft, b: Draft): boolean {
  return (
    a.phase !== b.phase ||
    a.nav_enabled !== b.nav_enabled ||
    a.seo_indexing_enabled !== b.seo_indexing_enabled ||
    (a.notes ?? "") !== (b.notes ?? "")
  );
}

function VisibilityPage() {
  const [rows, setRows] = useState<FeatureVisibilityRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FeatureStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<FeatureCategory | "all">("all");

  const refetch = async () => {
    setLoading(true);
    try {
      const data = await listFeatureVisibility();
      setRows(data);
      const next: Record<string, Draft> = {};
      for (const r of data) next[r.feature_key] = rowToDraft(r);
      setDrafts(next);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load visibility registry");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refetch();
  }, []);

  const baseline = useMemo(() => {
    const m: Record<string, Draft> = {};
    for (const r of rows) m[r.feature_key] = rowToDraft(r);
    return m;
  }, [rows]);

  const onSave = async (key: string) => {
    const d = drafts[key];
    const b = baseline[key];
    if (!d || !b) return;
    setSavingKey(key);
    try {
      await updateFeatureVisibility({
        data: {
          feature_key: key,
          phase: d.phase,
          nav_enabled: d.nav_enabled,
          seo_indexing_enabled: d.seo_indexing_enabled,
          notes: d.notes.trim() === "" ? null : d.notes,
        },
      });
      toast.success(`Updated ${key}`);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSavingKey(null);
    }
  };

  // Bulk toggle for an entire category (sets nav_enabled for all visible items
  // in that category — does NOT touch phase, so Phase 3 features stay hidden
  // unless an admin promotes them via phase). Saves each row individually.
  const onBulkToggleCategory = async (category: FeatureCategory, enabled: boolean) => {
    const keys = rows
      .map((r) => ({ key: r.feature_key, meta: getFeatureMeta(r.feature_key) }))
      .filter(({ meta }) => meta.category === category)
      .map(({ key }) => key);
    if (!keys.length) return;
    setSavingKey(`bulk:${category}`);
    try {
      for (const key of keys) {
        const d = drafts[key];
        if (!d) continue;
        if (d.nav_enabled === enabled) continue;
        await updateFeatureVisibility({
          data: {
            feature_key: key,
            phase: d.phase,
            nav_enabled: enabled,
            seo_indexing_enabled: d.seo_indexing_enabled,
            notes: d.notes.trim() === "" ? null : d.notes,
          },
        });
      }
      toast.success(`${enabled ? "Enabled" : "Disabled"} nav for ${CATEGORY_LABEL[category]}`);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || "Bulk update failed");
    } finally {
      setSavingKey(null);
    }
  };

  // Group rows by category, applying filters.
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const buckets = new Map<FeatureCategory, FeatureVisibilityRow[]>();
    for (const r of rows) {
      const meta = getFeatureMeta(r.feature_key);
      const status = computeStatus(r);
      if (categoryFilter !== "all" && meta.category !== categoryFilter) continue;
      if (statusFilter !== "all" && status !== statusFilter) continue;
      if (q) {
        const hay = `${meta.name} ${r.feature_key} ${meta.description}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const arr = buckets.get(meta.category) ?? [];
      arr.push(r);
      buckets.set(meta.category, arr);
    }
    return CATEGORY_ORDER.flatMap((cat) => {
      const items = buckets.get(cat);
      if (!items?.length) return [];
      // Sort: active first, then future, hidden, legacy; then by name.
      const order: Record<FeatureStatus, number> = { active: 0, future: 1, hidden: 2, legacy: 3 };
      items.sort((a, b) => {
        const sa = order[computeStatus(a)];
        const sb = order[computeStatus(b)];
        if (sa !== sb) return sa - sb;
        return getFeatureMeta(a.feature_key).name.localeCompare(getFeatureMeta(b.feature_key).name);
      });
      return [{ category: cat, items }];
    });
  }, [rows, search, statusFilter, categoryFilter]);

  // Counts for the status filter chips.
  const counts = useMemo(() => {
    const c: Record<FeatureStatus | "all", number> = { all: rows.length, active: 0, hidden: 0, future: 0, legacy: 0 };
    for (const r of rows) c[computeStatus(r)]++;
    return c;
  }, [rows]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Feature Visibility
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control which admin sections, admin pages, and public features are visible.
          Changes apply instantly — no deploy required. Edits are written to the audit log.
        </p>
      </div>

      {/* Admin-only-exposure notice */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-700 dark:text-amber-300">Turning a feature on here exposes admin UI only — not public pricing.</p>
          <p className="text-amber-700/80 dark:text-amber-300/80 mt-1">
            Public pricing remains gated by the dedicated <span className="font-mono">admin_pricing_visibility</span> control and the quote system's own pricing checks.
            These flags govern which links appear in the admin sidebar and which feature groups are reachable in public navigation.
          </p>
        </div>
      </div>

      {/* Status & phase legends */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Status legend</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {(Object.keys(STATUS_LABEL) as FeatureStatus[]).map((s) => (
              <div key={s} className="flex items-start gap-2">
                <Badge variant="outline" className={STATUS_BADGE_CLASS[s]}>{STATUS_LABEL[s]}</Badge>
                <span className="text-muted-foreground">{STATUS_DESCRIPTION[s]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Phase legend</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {VISIBILITY_PHASES.map((p) => (
              <div key={p} className="flex items-start gap-2">
                <Badge variant="outline" className={PHASE_BADGE_CLASS[p]}>{PHASE_LABEL[p]}</Badge>
                <span className="text-muted-foreground">{PHASE_DESCRIPTION[p]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search features…"
            className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses ({counts.all})</SelectItem>
              <SelectItem value="active">Active ({counts.active})</SelectItem>
              <SelectItem value="hidden">Hidden ({counts.hidden})</SelectItem>
              <SelectItem value="future">Future ({counts.future})</SelectItem>
              <SelectItem value="legacy">Legacy ({counts.legacy})</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
            <SelectTrigger className="w-60 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORY_ORDER.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading registry…
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ category, items }) => (
            <section key={category} className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{CATEGORY_LABEL[category]}</h2>
                  <p className="text-xs text-muted-foreground">{items.length} feature{items.length === 1 ? "" : "s"}</p>
                </div>
                {category !== "public_pages" && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingKey === `bulk:${category}`}
                      onClick={() => void onBulkToggleCategory(category, true)}
                    >
                      Enable all in nav
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingKey === `bulk:${category}`}
                      onClick={() => void onBulkToggleCategory(category, false)}
                    >
                      Disable all
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {items.map((r) => {
                  const d = drafts[r.feature_key];
                  const b = baseline[r.feature_key];
                  if (!d || !b) return null;
                  const meta = getFeatureMeta(r.feature_key);
                  const status = computeStatus(r);
                  const dirty = isDirty(d, b);
                  const seoForcedOff = d.phase === "soft_launch" || d.phase === "admin_preview" || d.phase === "off";
                  const isDestructive = meta.risk === "destructive" || meta.risk === "pricing";
                  return (
                    <Card key={r.feature_key} className={isDestructive ? "border-rose-500/30" : undefined}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <CardTitle className="text-base">{meta.name}</CardTitle>
                              <Badge variant="outline" className={STATUS_BADGE_CLASS[status]}>
                                {STATUS_LABEL[status]}
                              </Badge>
                              <Badge variant="outline" className={PHASE_BADGE_CLASS[r.phase]}>
                                {PHASE_LABEL[r.phase]}
                              </Badge>
                              <Badge variant="outline" className={RISK_BADGE_CLASS[meta.risk]}>
                                {RISK_LABEL[meta.risk]}
                              </Badge>
                              {meta.adminSurface && (
                                <Badge variant="outline" className="text-[10px] gap-1">
                                  <Lock className="w-3 h-3" /> Admin UI
                                </Badge>
                              )}
                              {!r.seo_indexing_enabled && r.phase === "public" && (
                                <Badge variant="outline" className="text-[10px] gap-1">
                                  <EyeOff className="w-3 h-3" /> noindex
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{meta.description}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {r.feature_key} · {meta.phaseRelevance}
                            </p>
                            {meta.riskNote && (
                              <div className="flex items-start gap-1.5 text-[12px] text-rose-600 dark:text-rose-400">
                                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <span>{meta.riskNote}</span>
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => onSave(r.feature_key)}
                            disabled={!dirty || savingKey === r.feature_key}
                            className="gap-1.5 flex-shrink-0"
                          >
                            {savingKey === r.feature_key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid sm:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Phase</label>
                            <Select
                              value={d.phase}
                              onValueChange={(v) => setDrafts((s) => ({ ...s, [r.feature_key]: { ...d, phase: v as VisibilityPhase } }))}
                            >
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {VISIBILITY_PHASES.map((p) => (
                                  <SelectItem key={p} value={p}>{PHASE_LABEL[p]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                            <div>
                              <p className="text-sm font-medium">Show in nav</p>
                              <p className="text-xs text-muted-foreground">
                                {meta.adminSurface ? "Controls the admin sidebar link." : "Controls the public nav link."}
                              </p>
                            </div>
                            <Switch
                              checked={d.nav_enabled}
                              onCheckedChange={(v) => setDrafts((s) => ({ ...s, [r.feature_key]: { ...d, nav_enabled: v } }))}
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                            <div>
                              <p className="text-sm font-medium">SEO indexing</p>
                              <p className="text-xs text-muted-foreground">
                                {seoForcedOff ? "Forced off below 'public' phase." : "Include in sitemap & allow crawl."}
                              </p>
                            </div>
                            <Switch
                              checked={d.seo_indexing_enabled && !seoForcedOff}
                              disabled={seoForcedOff}
                              onCheckedChange={(v) => setDrafts((s) => ({ ...s, [r.feature_key]: { ...d, seo_indexing_enabled: v } }))}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Notes</label>
                          <Textarea
                            value={d.notes}
                            onChange={(e) => setDrafts((s) => ({ ...s, [r.feature_key]: { ...d, notes: e.target.value } }))}
                            placeholder="Optional context — why this phase, what's gating launch, etc."
                            rows={2}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Last updated {new Date(r.updated_at).toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}

          {grouped.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No features match your filters.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
