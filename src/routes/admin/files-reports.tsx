import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Download, RefreshCw, GitCompare, FileText, BarChart3, Database,
  ExternalLink, Trash2, Search, AlertCircle,
} from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";
import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/files-reports")({
  head: () => ({
    meta: [
      { title: "Files & Reports — Admin" },
      { name: "description", content: "Unified hub for every generated file: quotes, audits, exports — with reports and run comparisons." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FilesReportsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="container mx-auto p-8">
        <Card><CardContent className="p-6 space-y-3">
          <p className="text-sm text-destructive">Failed to load Files & Reports: {error.message}</p>
          <Button onClick={() => { router.invalidate(); reset(); }}>Retry</Button>
        </CardContent></Card>
      </div>
    );
  },
});

type Row = {
  id: string;
  user_id: string | null;
  kind: string;
  filename: string;
  storage_path: string | null;
  public_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  source_id: string | null;
  source_label: string | null;
  created_at: string;
  module: string | null;
  record_count: number | null;
  generated_by_email: string | null;
  parameters: Record<string, unknown> | null;
};

type DailyRow = {
  day: string;
  module: string;
  kind: string;
  file_count: number;
  total_bytes: number;
  total_records: number;
  unique_generators: number;
};

const KINDS = ["all", "audit_export", "admin_export", "quote_pdf", "recipe_card", "newsletter_guide", "shopping_list", "other"];
const MODULES = ["all", "audit", "pricing", "quote", "recipe", "newsletter", "shopping", "menu", "brand", "kroger", "other"];

function fmtBytes(n: number | null | undefined) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function moduleOf(r: Pick<Row, "module" | "filename" | "source_label" | "kind">): string {
  if (r.module) return r.module;
  const hay = `${r.source_label ?? ""} ${r.filename} ${r.kind}`.toLowerCase();
  if (/audit/.test(hay)) return "audit";
  if (/pricing|cost/.test(hay)) return "pricing";
  if (/quote/.test(hay)) return "quote";
  if (/recipe/.test(hay)) return "recipe";
  if (/newsletter|guide/.test(hay)) return "newsletter";
  if (/shopping/.test(hay)) return "shopping";
  return "other";
}

function FilesReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleKey, setModuleKey] = useState("all");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState("files");

  const load = async () => {
    setLoading(true);
    const [filesRes, dailyRes] = await Promise.all([
      (supabase as any).from("user_downloads").select("*").order("created_at", { ascending: false }).limit(1000),
      (supabase as any).from("v_files_reports_daily").select("*").order("day", { ascending: false }).limit(500),
    ]);
    if (filesRes.error) toast.error("Couldn't load files", { description: filesRes.error.message });
    setRows((filesRes.data || []) as Row[]);
    setDaily((dailyRes.data || []) as DailyRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (moduleKey !== "all" && moduleOf(r) !== moduleKey) return false;
      if (kind !== "all" && r.kind !== kind) return false;
      if (!needle) return true;
      return (
        r.filename.toLowerCase().includes(needle) ||
        (r.source_label || "").toLowerCase().includes(needle) ||
        (r.generated_by_email || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, moduleKey, kind, q]);

  const toggleSelect = (id: string) => setSelected((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const onDelete = async (row: Row) => {
    if (!confirm(`Delete "${row.filename}"? The metadata row and stored copy will both be removed.`)) return;
    setRows((r) => r.filter((x) => x.id !== row.id));
    setSelected((s) => { const n = new Set(s); n.delete(row.id); return n; });
    const { error } = await (supabase as any).from("user_downloads").delete().eq("id", row.id);
    if (error) { toast.error("Couldn't delete", { description: error.message }); load(); return; }
    if (row.storage_path) {
      try { await supabase.storage.from("site-assets").remove([row.storage_path]); } catch { /* ignore */ }
    }
    toast.success("Removed");
  };

  const onRedownload = async (row: Row) => {
    if (row.public_url) { window.open(row.public_url, "_blank", "noopener,noreferrer"); return; }
    if (row.storage_path) {
      const { data } = await supabase.storage.from("site-assets").createSignedUrl(row.storage_path, 60);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      else toast.error("No public URL available");
    } else toast.error("This file wasn't persisted to storage");
  };

  // Group counts per module for the sidebar pills
  const moduleCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[moduleOf(r)] = (m[moduleOf(r)] || 0) + 1;
    return m;
  }, [rows]);

  // Reports aggregations
  const last30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
  }, [rows]);

  const topGenerators = useMemo(() => {
    const map: Record<string, { count: number; bytes: number }> = {};
    for (const r of last30) {
      const key = r.generated_by_email || "(unknown)";
      if (!map[key]) map[key] = { count: 0, bytes: 0 };
      map[key].count++;
      map[key].bytes += r.size_bytes || 0;
    }
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  }, [last30]);

  const totalBytes = filtered.reduce((s, r) => s + (r.size_bytes || 0), 0);

  // Compare candidates: at least 2 same-kind selected
  const selectedRows = useMemo(() => filtered.filter((r) => selected.has(r.id)), [filtered, selected]);
  const compareReady = selectedRows.length === 2 && selectedRows[0].kind === selectedRows[1].kind;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      <PageHelpCard route="/admin/files-reports" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold mb-1">Files &amp; Reports</h1>
          <p className="text-sm text-muted-foreground">
            Every generated file in one place — quotes, audits, exports — with run reports and side-by-side comparison.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="files" className="gap-2"><FileText className="w-4 h-4" /> All Files</TabsTrigger>
          <TabsTrigger value="reports" className="gap-2"><BarChart3 className="w-4 h-4" /> Reports</TabsTrigger>
          <TabsTrigger value="compare" className="gap-2"><GitCompare className="w-4 h-4" /> Compare ({selectedRows.length})</TabsTrigger>
        </TabsList>

        {/* ---------- TAB A — All files ---------- */}
        <TabsContent value="files" className="space-y-4">
          <Card>
            <CardContent className="py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Files (filtered)</p>
                <p className="text-2xl font-bold tabular-nums">{filtered.length}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Total size</p>
                <p className="text-2xl font-bold tabular-nums">{fmtBytes(totalBytes)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Modules</p>
                <p className="text-2xl font-bold tabular-nums">{Object.keys(moduleCounts).length}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">All time rows</p>
                <p className="text-2xl font-bold tabular-nums">{rows.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filename, label, email…" className="pl-8" />
                </div>
                <Select value={moduleKey} onValueChange={setModuleKey}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODULES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m === "all" ? "All modules" : m} {m !== "all" && moduleCounts[m] ? `(${moduleCounts[m]})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => <SelectItem key={k} value={k}>{k === "all" ? "All kinds" : k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? <LoadingState /> : filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <AlertCircle className="w-5 h-5 mx-auto mb-2" />
                  No files match. Run a Deep Audit, Pricing Audit, or any export to populate this list.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2 w-8"></th>
                        <th className="text-left p-2">File</th>
                        <th className="text-left p-2">Module</th>
                        <th className="text-left p-2">Kind</th>
                        <th className="text-right p-2">Records</th>
                        <th className="text-right p-2">Size</th>
                        <th className="text-left p-2">Generated by</th>
                        <th className="text-left p-2">When</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} className="border-t border-border/40 hover:bg-muted/30">
                          <td className="p-2">
                            <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
                          </td>
                          <td className="p-2">
                            <p className="font-medium truncate max-w-[260px]" title={r.filename}>{r.filename}</p>
                            {r.source_label && <p className="text-xs text-muted-foreground truncate max-w-[260px]">{r.source_label}</p>}
                          </td>
                          <td className="p-2"><Badge variant="outline">{moduleOf(r)}</Badge></td>
                          <td className="p-2 font-mono text-xs">{r.kind}</td>
                          <td className="p-2 text-right tabular-nums">{r.record_count ?? "—"}</td>
                          <td className="p-2 text-right tabular-nums">{fmtBytes(r.size_bytes)}</td>
                          <td className="p-2 text-xs">{r.generated_by_email || "—"}</td>
                          <td className="p-2 text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="p-2">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => onRedownload(r)} title="Download again">
                                <Download className="w-4 h-4" />
                              </Button>
                              {r.public_url && (
                                <Button size="icon" variant="ghost" onClick={() => window.open(r.public_url!, "_blank")} title="Open">
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" onClick={() => onDelete(r)} title="Delete">
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedRows.length >= 1 && (
            <Card className="border-primary/40">
              <CardContent className="py-3 flex items-center gap-3 flex-wrap">
                <p className="text-sm">
                  <strong>{selectedRows.length}</strong> selected.
                  {selectedRows.length === 2 && !compareReady && (
                    <span className="text-muted-foreground"> Pick two of the same <em>kind</em> to compare.</span>
                  )}
                </p>
                <Button size="sm" disabled={!compareReady} onClick={() => setTab("compare")}>
                  Compare selected
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------- TAB B — Reports ---------- */}
        <TabsContent value="reports" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs uppercase text-muted-foreground">Files (last 30d)</p>
                <p className="text-3xl font-bold tabular-nums">{last30.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs uppercase text-muted-foreground">Storage (all time)</p>
                <p className="text-3xl font-bold tabular-nums">
                  {fmtBytes(rows.reduce((s, r) => s + (r.size_bytes || 0), 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs uppercase text-muted-foreground">Active generators (30d)</p>
                <p className="text-3xl font-bold tabular-nums">
                  {new Set(last30.map((r) => r.generated_by_email).filter(Boolean)).size}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Activity by module · last 14 days</CardTitle></CardHeader>
            <CardContent>
              <DailyByModuleChart daily={daily.slice(0, 200)} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Top generators (30d)</CardTitle></CardHeader>
              <CardContent>
                {topGenerators.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr><th className="text-left py-1">Email</th><th className="text-right">Files</th><th className="text-right">Size</th></tr>
                    </thead>
                    <tbody>
                      {topGenerators.map(([email, v]) => (
                        <tr key={email} className="border-t border-border/40">
                          <td className="py-1">{email}</td>
                          <td className="py-1 text-right tabular-nums">{v.count}</td>
                          <td className="py-1 text-right tabular-nums">{fmtBytes(v.bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Latest audit runs</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(["audit", "pricing"] as const).map((mod) => {
                  const latest = rows.find((r) => moduleOf(r) === mod && r.kind === "audit_export");
                  return (
                    <div key={mod} className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 last:border-b-0">
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">{mod}</p>
                        <p className="text-sm font-medium">{latest?.filename ?? "No run yet"}</p>
                        {latest && <p className="text-xs text-muted-foreground">{new Date(latest.created_at).toLocaleString()}</p>}
                      </div>
                      {latest && (
                        <Button size="sm" variant="outline" onClick={() => onRedownload(latest)}>
                          <Download className="w-3 h-3 mr-1" /> Open
                        </Button>
                      )}
                    </div>
                  );
                })}
                <Link to="/admin/exports" className="text-xs text-primary hover:underline inline-flex items-center gap-1 pt-2">
                  Run a new audit <ExternalLink className="w-3 h-3" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------- TAB C — Compare ---------- */}
        <TabsContent value="compare" className="space-y-4">
          {!compareReady ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              <Database className="w-6 h-6 mx-auto mb-2" />
              Select <strong>two files of the same kind</strong> on the All Files tab, then return here.
            </CardContent></Card>
          ) : (
            <CompareView a={selectedRows[0]} b={selectedRows[1]} onRedownload={onRedownload} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Sub-components ----------

function DailyByModuleChart({ daily }: { daily: DailyRow[] }) {
  // Aggregate per day across modules for a simple bar chart
  const byDay: Record<string, Record<string, number>> = {};
  const moduleSet = new Set<string>();
  for (const d of daily) {
    const day = String(d.day).slice(0, 10);
    if (!byDay[day]) byDay[day] = {};
    byDay[day][d.module] = (byDay[day][d.module] || 0) + d.file_count;
    moduleSet.add(d.module);
  }
  const days = Object.keys(byDay).sort().slice(-14);
  if (days.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const max = Math.max(1, ...days.map((d) => Object.values(byDay[d]).reduce((a, b) => a + b, 0)));
  const palette = ["bg-primary", "bg-blue-500", "bg-green-500", "bg-amber-500", "bg-purple-500", "bg-pink-500", "bg-cyan-500", "bg-rose-500"];
  const modules = Array.from(moduleSet).sort();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs">
        {modules.map((m, i) => (
          <span key={m} className="inline-flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded ${palette[i % palette.length]}`} /> {m}
          </span>
        ))}
      </div>
      <div className="flex items-end gap-2 h-40">
        {days.map((day) => {
          const total = Object.values(byDay[day]).reduce((a, b) => a + b, 0);
          const heightPct = (total / max) * 100;
          return (
            <div key={day} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col-reverse rounded overflow-hidden border border-border/40" style={{ height: `${heightPct}%`, minHeight: total > 0 ? 4 : 0 }}>
                {modules.map((m, i) => {
                  const v = byDay[day][m] || 0;
                  if (!v) return null;
                  const pct = (v / total) * 100;
                  return <div key={m} className={palette[i % palette.length]} style={{ height: `${pct}%` }} title={`${m}: ${v}`} />;
                })}
              </div>
              <span className="text-[10px] text-muted-foreground rotate-[-30deg] origin-top-left whitespace-nowrap">{day.slice(5)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompareView({ a, b, onRedownload }: { a: Row; b: Row; onRedownload: (r: Row) => void }) {
  const [textA, setTextA] = useState<string | null>(null);
  const [textB, setTextB] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isText = (r: Row) => /^(text\/|application\/(json|xml|csv))/.test(r.mime_type || "") || /\.(md|txt|csv|json)$/i.test(r.filename);

  useEffect(() => {
    let cancelled = false;
    setErr(null); setTextA(null); setTextB(null);
    const fetchOne = async (r: Row) => {
      if (!isText(r)) return null;
      let url = r.public_url;
      if (!url && r.storage_path) {
        const { data } = await supabase.storage.from("site-assets").createSignedUrl(r.storage_path, 60);
        url = data?.signedUrl ?? null;
      }
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Couldn't load ${r.filename}: ${res.status}`);
      return res.text();
    };
    Promise.all([fetchOne(a), fetchOne(b)])
      .then(([ta, tb]) => { if (!cancelled) { setTextA(ta); setTextB(tb); } })
      .catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [a.id, b.id]);

  const paramDiff = useMemo(() => {
    const pa = a.parameters || {}; const pb = b.parameters || {};
    const keys = Array.from(new Set([...Object.keys(pa), ...Object.keys(pb)])).sort();
    return keys.map((k) => ({
      key: k,
      a: JSON.stringify((pa as any)[k] ?? null),
      b: JSON.stringify((pb as any)[k] ?? null),
      same: JSON.stringify((pa as any)[k]) === JSON.stringify((pb as any)[k]),
    }));
  }, [a, b]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[a, b].map((r, i) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="truncate">{i === 0 ? "A" : "B"} · {r.filename}</span>
                <Button size="sm" variant="ghost" onClick={() => onRedownload(r)}><Download className="w-3 h-3" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1">
              <p><span className="text-muted-foreground">When:</span> {new Date(r.created_at).toLocaleString()}</p>
              <p><span className="text-muted-foreground">By:</span> {r.generated_by_email || "—"}</p>
              <p><span className="text-muted-foreground">Records:</span> {r.record_count ?? "—"}</p>
              <p><span className="text-muted-foreground">Size:</span> {fmtBytes(r.size_bytes)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Parameter diff</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 uppercase text-muted-foreground">
              <tr><th className="text-left p-2">Key</th><th className="text-left p-2">A</th><th className="text-left p-2">B</th></tr>
            </thead>
            <tbody>
              {paramDiff.length === 0 ? (
                <tr><td colSpan={3} className="p-3 text-center text-muted-foreground">No parameters recorded.</td></tr>
              ) : paramDiff.map((p) => (
                <tr key={p.key} className={`border-t border-border/40 ${p.same ? "" : "bg-amber-50 dark:bg-amber-950/20"}`}>
                  <td className="p-2 font-mono">{p.key}</td>
                  <td className="p-2 font-mono">{p.a}</td>
                  <td className="p-2 font-mono">{p.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Content diff</CardTitle></CardHeader>
        <CardContent>
          {err ? (
            <p className="text-sm text-destructive">{err}</p>
          ) : !isText(a) || !isText(b) ? (
            <p className="text-sm text-muted-foreground">Content diff is only available for text files (md, csv, json, txt).</p>
          ) : textA === null || textB === null ? (
            <LoadingState />
          ) : (
            <LineDiff a={textA} b={textB} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LineDiff({ a, b }: { a: string; b: string }) {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const setB = new Set(linesB);
  const setA = new Set(linesA);
  const max = Math.max(linesA.length, linesB.length);
  const rowsOut: { a: string; b: string; same: boolean }[] = [];
  for (let i = 0; i < max; i++) {
    const la = linesA[i] ?? "";
    const lb = linesB[i] ?? "";
    rowsOut.push({ a: la, b: lb, same: la === lb });
  }
  const onlyInA = linesA.filter((l) => !setB.has(l)).length;
  const onlyInB = linesB.filter((l) => !setA.has(l)).length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {linesA.length} vs {linesB.length} lines · {onlyInA} only in A · {onlyInB} only in B
      </p>
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono max-h-[600px] overflow-auto border border-border/40 rounded">
        <pre className="p-2 whitespace-pre-wrap">
          {rowsOut.slice(0, 800).map((r, i) => (
            <div key={i} className={r.same ? "" : "bg-red-50 dark:bg-red-950/30"}>{r.a || "\u00A0"}</div>
          ))}
        </pre>
        <pre className="p-2 whitespace-pre-wrap border-l border-border/40">
          {rowsOut.slice(0, 800).map((r, i) => (
            <div key={i} className={r.same ? "" : "bg-green-50 dark:bg-green-950/30"}>{r.b || "\u00A0"}</div>
          ))}
        </pre>
      </div>
      {rowsOut.length > 800 && <p className="text-xs text-muted-foreground">Showing first 800 lines.</p>}
    </div>
  );
}
