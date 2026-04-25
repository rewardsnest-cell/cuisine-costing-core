import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ExternalLink, Search, RefreshCw, LayoutGrid, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";
import { NAV_GROUPS } from "@/routes/admin";
import {
  listFeatureVisibility,
  updateFeatureVisibility,
  VISIBILITY_PHASES,
  type FeatureVisibilityRow,
  type VisibilityPhase,
} from "@/lib/server-fns/feature-visibility.functions";
import { PHASE_LABEL, PHASE_BADGE_CLASS } from "@/lib/feature-visibility";

export const Route = createFileRoute("/admin/pages")({
  head: () => ({
    meta: [
      { title: "Admin Pages Registry — VPS Finest" },
      { name: "description", content: "All admin pages: viable, active, and toggleable." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPagesRegistry,
});

// Vite glob: every existing admin route file. Used to determine "viable".
const ROUTE_FILES = import.meta.glob("/src/routes/admin/**/*.tsx", { eager: false });

/** "/admin/cooking-lab" -> "/src/routes/admin/cooking-lab.tsx" candidates */
function candidateFilesFor(to: string): string[] {
  const tail = to.replace(/^\/admin\/?/, "");
  if (!tail) return ["/src/routes/admin/index.tsx"];
  // Translate dynamic segments like /admin/quotes/$id to dot form quotes.$id
  const dot = tail.replace(/\//g, ".");
  return [
    `/src/routes/admin/${dot}.tsx`,
    `/src/routes/admin/${dot}/index.tsx`,
    `/src/routes/admin/${dot}.index.tsx`,
  ];
}

function isViable(to: string): boolean {
  if (to === "/" || to === "/admin") return true;
  return candidateFilesFor(to).some((p) => p in ROUTE_FILES);
}

type Row = {
  to: string;
  label: string;
  group: string;
  featureKey: string | null;
  viable: boolean;
  phase: VisibilityPhase | null;
  navEnabled: boolean | null;
  registered: boolean;
};

function buildRows(visibility: FeatureVisibilityRow[]): Row[] {
  const map = new Map(visibility.map((r) => [r.feature_key, r]));
  const out: Row[] = [];
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to === "/") continue; // skip the public Home shortcut
      const fk = item.featureKey ?? null;
      const v = fk ? map.get(fk) : null;
      out.push({
        to: item.to,
        label: item.label,
        group: group.label,
        featureKey: fk,
        viable: isViable(item.to),
        phase: v ? v.phase : null,
        navEnabled: v ? v.nav_enabled : null,
        registered: !!v || !fk,
      });
    }
  }
  return out;
}

function AdminPagesRegistry() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const data = await listFeatureVisibility();
      setRows(buildRows(data));
    } catch (e: any) {
      toast.error("Couldn't load registry", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const groups = useMemo(
    () => Array.from(new Set(NAV_GROUPS.map((g) => g.label))),
    [],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (groupFilter !== "all" && r.group !== groupFilter) return false;
      if (statusFilter === "active" && !(r.viable && r.navEnabled !== false && r.phase !== "off")) return false;
      if (statusFilter === "off" && r.phase !== "off") return false;
      if (statusFilter === "broken" && r.viable) return false;
      if (statusFilter === "unregistered" && r.registered) return false;
      if (!needle) return true;
      return (
        r.label.toLowerCase().includes(needle) ||
        r.to.toLowerCase().includes(needle) ||
        (r.featureKey || "").toLowerCase().includes(needle) ||
        r.group.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, groupFilter, statusFilter]);

  const counts = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.viable && r.navEnabled !== false && r.phase !== "off").length;
    const off = rows.filter((r) => r.phase === "off").length;
    const broken = rows.filter((r) => !r.viable).length;
    return { total, active, off, broken };
  }, [rows]);

  const patchRow = async (row: Row, patch: { phase?: VisibilityPhase; nav_enabled?: boolean }) => {
    if (!row.featureKey) {
      toast.error("This page has no feature key — can't toggle.");
      return;
    }
    setSaving(row.featureKey);
    // Optimistic
    setRows((rs) =>
      rs.map((r) =>
        r.featureKey === row.featureKey
          ? {
              ...r,
              phase: patch.phase ?? r.phase,
              navEnabled: patch.nav_enabled ?? r.navEnabled,
            }
          : r,
      ),
    );
    try {
      await updateFeatureVisibility({ data: { feature_key: row.featureKey, ...patch } });
      toast.success("Saved");
    } catch (e: any) {
      toast.error("Couldn't save", { description: e.message });
      load(); // revert
    } finally {
      setSaving(null);
    }
  };

  const resetFilters = () => { setQ(""); setGroupFilter("all"); setStatusFilter("all"); };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold mb-1 flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-primary" /> Admin Pages Registry
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Every admin page in one place. See if the route file exists (viable),
            whether it's currently active in the sidebar, and toggle phase or nav
            visibility without leaving this screen.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Total pages" value={counts.total} />
          <Stat label="Active" value={counts.active} accent="text-emerald-600" />
          <Stat label="Off" value={counts.off} accent="text-muted-foreground" />
          <Stat label="Missing route file" value={counts.broken} accent="text-destructive" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All admin pages</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search label, path, or feature key…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-[200px]" aria-label="Filter by group"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="broken">Missing file</SelectItem>
                <SelectItem value="unregistered">Unregistered key</SelectItem>
              </SelectContent>
            </Select>
            {(q || groupFilter !== "all" || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>Clear</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No pages match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-4">Page</th>
                    <th className="py-2 pr-4">Group</th>
                    <th className="py-2 pr-4">Viable</th>
                    <th className="py-2 pr-4">Phase</th>
                    <th className="py-2 pr-4">In nav</th>
                    <th className="py-2 pr-4">Feature key</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((r) => {
                    const active = r.viable && r.navEnabled !== false && r.phase !== "off";
                    return (
                      <tr key={r.to} className={!r.viable ? "bg-destructive/5" : ""}>
                        <td className="py-2 pr-4">
                          <p className="font-medium">{r.label}</p>
                          <p className="text-xs text-muted-foreground font-mono">{r.to}</p>
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{r.group}</td>
                        <td className="py-2 pr-4">
                          {r.viable ? (
                            <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
                              <CheckCircle2 className="w-3 h-3" /> Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-destructive border-destructive/40">
                              <XCircle className="w-3 h-3" /> Missing file
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {r.featureKey ? (
                            <Select
                              value={r.phase ?? "public"}
                              onValueChange={(v) => patchRow(r, { phase: v as VisibilityPhase })}
                              disabled={saving === r.featureKey || !r.registered}
                            >
                              <SelectTrigger className="w-[150px] h-8" aria-label="Phase">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VISIBILITY_PHASES.map((p) => (
                                  <SelectItem key={p} value={p}>
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] ${PHASE_BADGE_CLASS[p]}`}>
                                      {PHASE_LABEL[p]}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {r.featureKey && !r.registered && (
                            <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> not in DB
                            </p>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {r.featureKey ? (
                            <Switch
                              checked={r.navEnabled !== false}
                              onCheckedChange={(checked) => patchRow(r, { nav_enabled: checked })}
                              disabled={saving === r.featureKey || !r.registered}
                              aria-label={`Toggle ${r.label} in sidebar`}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">always</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                          {r.featureKey ?? "—"}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={active
                              ? "text-emerald-700 border-emerald-300"
                              : "text-muted-foreground"}
                          >
                            {active ? "Active" : "Hidden"}
                          </Badge>
                          {r.viable && (
                            <Link to={r.to as any}>
                              <Button variant="ghost" size="icon" aria-label="Open page" className="ml-1">
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-4">
        "Viable" means the route file exists in <code>src/routes/admin/</code>.
        "Active" means it's both viable, has a phase other than <em>Off</em>, and is enabled in the sidebar.
        Direct URLs always work even when hidden — toggles only affect the sidebar.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
