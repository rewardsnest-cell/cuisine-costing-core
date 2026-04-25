import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Download, Trash2, FileDown, Search, RefreshCw, ChevronDown, ChevronRight, Info, Copy, ExternalLink,
} from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/downloads")({
  head: () => ({
    meta: [
      { title: "Downloads Hub — Admin" },
      { name: "description", content: "Every file generated across the app, by every user." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDownloadsPage,
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

const KINDS = [
  "all", "recipe_card", "quote_pdf", "newsletter_guide",
  "shopping_list", "audit_export", "admin_export", "other",
];

/** Best-effort module classification from filename + label. */
const MODULES: { key: string; label: string; match: RegExp }[] = [
  { key: "pricing",    label: "Pricing",     match: /pricing|cost|sql.appendix/i },
  { key: "quote",      label: "Quotes",      match: /quote/i },
  { key: "recipe",     label: "Recipes",     match: /recipe/i },
  { key: "audit",      label: "Audit",       match: /audit|inventory|inspection/i },
  { key: "newsletter", label: "Newsletter",  match: /newsletter|guide/i },
  { key: "shopping",   label: "Shopping",    match: /shopping/i },
  { key: "kroger",     label: "Kroger",      match: /kroger/i },
  { key: "menu",       label: "Menu",        match: /menu/i },
  { key: "brand",      label: "Brand",       match: /brand|logo/i },
];

function moduleOf(r: { filename: string; source_label: string | null; module?: string | null }): string {
  if (r.module) return r.module;
  const hay = `${r.source_label ?? ""} ${r.filename}`;
  for (const m of MODULES) if (m.match.test(hay)) return m.key;
  return "other";
}

function hasParams(p: Record<string, unknown> | null | undefined) {
  return !!p && typeof p === "object" && Object.keys(p).length > 0;
}

function fmtBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** YYYY-MM-DD in local time for <input type="date"> value comparisons. */
function localDay(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function AdminDownloadsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("all");
  const [moduleKey, setModuleKey] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailsRow, setDetailsRow] = useState<Row | null>(null);

  const copyText = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error("Couldn't copy"); }
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("user_downloads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error("Couldn't load", { description: error.message });
    const list = (data || []) as Row[];
    setRows(list);

    // Resolve user emails
    const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await (supabase as any)
        .from("profiles").select("user_id, email").in("user_id", ids);
      const map: Record<string, string> = {};
      for (const p of profs || []) map[p.user_id] = p.email;
      setEmails(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (moduleKey !== "all" && moduleOf(r) !== moduleKey) return false;
      if (dateFrom || dateTo) {
        const day = localDay(r.created_at);
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
      }
      if (!needle) return true;
      return (
        r.filename.toLowerCase().includes(needle) ||
        (r.source_label || "").toLowerCase().includes(needle) ||
        (r.generated_by_email || "").toLowerCase().includes(needle) ||
        (emails[r.user_id || ""] || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, kind, moduleKey, dateFrom, dateTo, q, emails]);

  const resetFilters = () => {
    setKind("all"); setModuleKey("all"); setDateFrom(""); setDateTo(""); setQ("");
  };

  const onDelete = async (id: string) => {
    if (!confirm("Permanently remove this download record?")) return;
    const row = rows.find((r) => r.id === id);
    setRows((r) => r.filter((x) => x.id !== id));
    const { error } = await (supabase as any).from("user_downloads").delete().eq("id", id);
    if (error) { toast.error("Couldn't delete", { description: error.message }); return; }
    if (row?.storage_path) {
      try { await supabase.storage.from("site-assets").remove([row.storage_path]); } catch { /* ignore */ }
    }
    toast.success("Removed");
  };

  const totalSize = filtered.reduce((s, r) => s + (r.size_bytes || 0), 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold mb-1">Downloads Hub</h1>
          <p className="text-sm text-muted-foreground">
            Every file generated across the app — recipe cards, quotes, exports, newsletters.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</Button>
      </div>

      <Card className="mb-4">
        <CardContent className="py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Total files</p>
            <p className="text-2xl font-bold tabular-nums">{filtered.length}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Total size</p>
            <p className="text-2xl font-bold tabular-nums">{fmtBytes(totalSize)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Unique users</p>
            <p className="text-2xl font-bold tabular-nums">
              {new Set(filtered.map((r) => r.user_id).filter(Boolean)).size}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Kinds</p>
            <p className="text-2xl font-bold tabular-nums">
              {new Set(filtered.map((r) => r.kind)).size}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="w-4 h-4" /> All downloads
          </CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search filename, label, email…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-[160px]" aria-label="Filter by kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k} value={k}>{k === "all" ? "All kinds" : k}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={moduleKey} onValueChange={setModuleKey}>
              <SelectTrigger className="w-[160px]" aria-label="Filter by module"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {MODULES.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
                aria-label="To date"
              />
            </div>
            {(kind !== "all" || moduleKey !== "all" || dateFrom || dateTo || q) && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>Clear</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No downloads match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-2 w-6"></th>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Kind</th>
                    <th className="py-2 pr-4">File</th>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Records</th>
                    <th className="py-2 pr-4">Size</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((r) => {
                    const isOpen = expanded.has(r.id);
                    const showDetails = isOpen && (hasParams(r.parameters) || r.generated_by_email || r.record_count != null);
                    return (
                      <Fragment key={r.id}>
                        <tr>
                          <td className="py-2 pr-2 align-top">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => toggleExpand(r.id)}
                              aria-label={isOpen ? "Hide details" : "Show details"}
                            >
                              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </Button>
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 pr-4">
                            <div className="flex flex-col gap-1">
                              <Badge variant="secondary">{r.kind}</Badge>
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                {MODULES.find((m) => m.key === moduleOf(r))?.label ?? "Other"}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-2 pr-4">
                            <p className="font-medium">{r.source_label || r.filename}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[280px]">{r.filename}</p>
                          </td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground truncate max-w-[200px]">
                            {r.generated_by_email || emails[r.user_id || ""] || r.user_id?.slice(0, 8) || "—"}
                          </td>
                          <td className="py-2 pr-4 tabular-nums text-xs">
                            {r.record_count != null ? r.record_count.toLocaleString() : "—"}
                          </td>
                          <td className="py-2 pr-4 tabular-nums text-xs">{fmtBytes(r.size_bytes)}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {r.public_url && (
                              <a href={r.public_url} target="_blank" rel="noopener" download={r.filename}>
                                <Button variant="ghost" size="icon" aria-label="Download"><Download className="w-4 h-4" /></Button>
                              </a>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)} aria-label="Delete">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                        {showDetails && (
                          <tr key={`${r.id}-details`} className="bg-muted/30">
                            <td></td>
                            <td colSpan={7} className="py-3 pr-4">
                              <div className="grid gap-2 text-xs">
                                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                                  <span><span className="font-semibold text-foreground">Module:</span> {moduleOf(r)}</span>
                                  {r.record_count != null && (
                                    <span><span className="font-semibold text-foreground">Records:</span> {r.record_count.toLocaleString()}</span>
                                  )}
                                  {r.generated_by_email && (
                                    <span><span className="font-semibold text-foreground">Generated by:</span> {r.generated_by_email}</span>
                                  )}
                                </div>
                                {hasParams(r.parameters) && (
                                  <div>
                                    <p className="font-semibold mb-1">Parameters</p>
                                    <pre className="bg-background border rounded p-2 overflow-x-auto text-[11px] leading-snug">
{JSON.stringify(r.parameters, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
