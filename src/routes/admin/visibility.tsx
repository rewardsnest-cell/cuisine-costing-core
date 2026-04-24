import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Globe, EyeOff, Search, Power, CheckCircle2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  listFeatureVisibility,
  updateFeatureVisibility,
  VISIBILITY_PHASES,
  type FeatureVisibilityRow,
  type VisibilityPhase,
} from "@/lib/server-fns/feature-visibility.functions";
import { PHASE_LABEL, PHASE_DESCRIPTION, PHASE_BADGE_CLASS } from "@/lib/feature-visibility";

export const Route = createFileRoute("/admin/visibility")({
  head: () => ({ meta: [{ title: "Global Visibility & Phase Control — Admin" }] }),
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
  const [quickToggling, setQuickToggling] = useState<string | null>(null);

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

  // Quick on/off toggle: ON = phase 'public' + nav_enabled true, OFF = phase 'off' + nav_enabled false.
  // Writes immediately so the sidebar (which reads the same registry) updates without a redeploy.
  const onQuickToggle = async (key: string, turnOn: boolean) => {
    setQuickToggling(key);
    try {
      await updateFeatureVisibility({
        data: {
          feature_key: key,
          phase: turnOn ? "public" : "off",
          nav_enabled: turnOn,
        },
      });
      toast.success(`${key} ${turnOn ? "enabled" : "disabled"}`);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || "Toggle failed");
    } finally {
      setQuickToggling(null);
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.feature_key.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q) ||
        r.phase.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Global Visibility & Phase Control
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-semibold">Admin Only.</span> Every public feature group obeys this registry.
          Changes are written to the audit log and create draft entries in the change log automatically.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Phase legend</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3 text-xs">
          {VISIBILITY_PHASES.map((p) => (
            <div key={p} className="flex items-start gap-2">
              <Badge variant="outline" className={PHASE_BADGE_CLASS[p]}>
                {PHASE_LABEL[p]}
              </Badge>
              <span className="text-muted-foreground">{PHASE_DESCRIPTION[p]}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by key, notes, or phase…"
            className="pl-8"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {filteredRows.length} of {rows.length}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading registry…
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRows.map((r) => {
            const d = drafts[r.feature_key];
            const b = baseline[r.feature_key];
            if (!d || !b) return null;
            const dirty = isDirty(d, b);
            const seoForcedOff = d.phase === "soft_launch" || d.phase === "admin_preview" || d.phase === "off";
            const isOn = r.phase === "public" && r.nav_enabled;
            return (
              <Card key={r.feature_key}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-mono">{r.feature_key}</CardTitle>
                      <Badge variant="outline" className={PHASE_BADGE_CLASS[r.phase]}>
                        {PHASE_LABEL[r.phase]}
                      </Badge>
                      {!r.nav_enabled && <Badge variant="outline" className="text-xs">Nav off</Badge>}
                      {!r.seo_indexing_enabled && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <EyeOff className="w-3 h-3" /> noindex
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                        <Power className={`w-3.5 h-3.5 ${isOn ? "text-emerald-500" : "text-muted-foreground"}`} />
                        <span className="text-xs text-muted-foreground">{isOn ? "On" : "Off"}</span>
                        <Switch
                          checked={isOn}
                          disabled={quickToggling === r.feature_key}
                          onCheckedChange={(v) => onQuickToggle(r.feature_key, v)}
                        />
                      </div>
                      <Button size="sm" onClick={() => onSave(r.feature_key)} disabled={!dirty || savingKey === r.feature_key} className="gap-1.5">
                        {savingKey === r.feature_key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                      </Button>
                    </div>
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
                        <p className="text-xs text-muted-foreground">Only effective when phase = public.</p>
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
      )}
    </div>
  );
}
