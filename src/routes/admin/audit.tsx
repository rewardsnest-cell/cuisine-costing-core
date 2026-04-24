import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Download, Search, Eye, Shield } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import { downloadFile } from "@/lib/admin/project-audit";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({
    meta: [
      { title: "Internal Audit Log — Admin" },
      { name: "description", content: "Read-only audit log of system events." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuditLogPage,
});

type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  actor_user_id: string | null;
  actor_email: string | null;
  target_user_id: string | null;
  target_email: string | null;
  details: Record<string, any> | null;
};

const PAGE_SIZE = 100;

function inferEntityType(action: string, details: Record<string, any> | null): string {
  if (details && typeof details === "object") {
    if ("recipe_id" in details) return "recipe";
    if ("module_id" in details) return "menu_module";
    if ("item_id" in details || "reference_id" in details) return "item";
    if ("pricing_model_id" in details) return "pricing_model";
    if ("quote_id" in details) return "quote";
    if ("receipt_id" in details) return "receipt";
    if ("competitor_id" in details) return "competitor";
    if ("brand_config" in details) return "brand_config";
  }
  const a = action.toLowerCase();
  if (a.includes("recipe")) return "recipe";
  if (a.includes("menu_module") || a.includes("module")) return "menu_module";
  if (a.includes("cost") || a.includes("kroger") || a.includes("item")) return "item";
  if (a.includes("pricing_model")) return "pricing_model";
  if (a.includes("quote")) return "quote";
  if (a.includes("receipt")) return "receipt";
  if (a.includes("brand")) return "brand_config";
  if (a.includes("role") || a.includes("user") || a.includes("access")) return "user";
  return "system";
}

function inferEntityId(details: Record<string, any> | null): string {
  if (!details || typeof details !== "object") return "";
  const keys = ["recipe_id", "module_id", "reference_id", "item_id", "pricing_model_id", "quote_id", "receipt_id", "competitor_id"];
  for (const k of keys) {
    if (details[k]) return String(details[k]);
  }
  return "";
}

function summarize(row: AuditRow): string {
  const d = row.details ?? {};
  if (typeof d === "object" && d !== null) {
    if (d.summary) return String(d.summary);
    if (d.note) return String(d.note);
    if (d.title) return String(d.title);
    if (d.percent_change != null) {
      return `${row.action} (Δ ${Number(d.percent_change).toFixed(2)}%)`;
    }
  }
  return row.action;
}

function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");
  const [actor, setActor] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [highlightIds, setHighlightIds] = useState<string[] | null>(null);

  // Detail modal
  const [selected, setSelected] = useState<AuditRow | null>(null);

  useEffect(() => {
    // Read ?ids= from URL to preselect highlight (linked from change log)
    const params = new URLSearchParams(window.location.search);
    const idsRaw = params.get("ids");
    if (idsRaw) {
      setHighlightIds(idsRaw.split(",").filter(Boolean));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      let q = supabase
        .from("access_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (startDate) q = q.gte("created_at", new Date(startDate).toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        q = q.lt("created_at", end.toISOString());
      }
      if (eventType !== "all") q = q.eq("action", eventType);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as AuditRow[]);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, eventType]);

  const eventTypes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.action));
    return Array.from(s).sort();
  }, [rows]);

  const actors = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      if (r.actor_email) s.add(r.actor_email);
    });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (highlightIds && !highlightIds.includes(r.id)) return false;
      if (actor !== "all" && r.actor_email !== actor) return false;
      if (entityType !== "all" && inferEntityType(r.action, r.details) !== entityType) return false;
      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        const haystack = [
          r.id,
          r.action,
          r.actor_email ?? "",
          inferEntityId(r.details),
          summarize(r),
          JSON.stringify(r.details ?? {}),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, search, actor, entityType, highlightIds]);

  const exportCsv = async () => {
    if (filtered.length === 0) {
      toast.error("No rows to export with the current filters.");
      return;
    }
    const headers = ["timestamp", "event_type", "entity_type", "entity_id", "summary", "actor", "id"];
    const lines = [headers.join(",")];
    for (const r of filtered) {
      const cells = [
        r.created_at,
        r.action,
        inferEntityType(r.action, r.details),
        inferEntityId(r.details),
        summarize(r).replace(/"/g, '""'),
        r.actor_email ?? "",
        r.id,
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    try {
      await downloadFile(lines.join("\n"), "audit-log.csv", "text/csv");
      toast.success(`Exported ${filtered.length} rows to CSV.`);
    } catch (err: any) {
      if (err?.name !== "AbortError") toast.error(err?.message || "Export failed");
    }
  };

  const exportJson = async () => {
    if (filtered.length === 0) {
      toast.error("No rows to export with the current filters.");
      return;
    }
    try {
      await downloadFile(JSON.stringify(filtered, null, 2), "audit-log.json", "application/json");
      toast.success(`Exported ${filtered.length} rows to JSON.`);
    } catch (err: any) {
      if (err?.name !== "AbortError") toast.error(err?.message || "Export failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-muted-foreground" />
            <h1 className="font-display text-2xl font-bold">Internal Audit Log — Administrative Use Only</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Read-only system truth. {rows.length} most recent events shown ({filtered.length} after filters).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
          <Button variant="outline" onClick={exportJson}>
            <Download className="w-4 h-4 mr-2" /> JSON
          </Button>
        </div>
      </div>

      {highlightIds && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-3 flex items-center justify-between text-sm">
            <span>Showing {highlightIds.length} linked audit event(s) from a Change Log entry.</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setHighlightIds(null);
                window.history.replaceState({}, "", "/admin/audit");
              }}
            >
              Clear filter
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Search (entity ID or summary)</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Event type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {eventTypes.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Entity type</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="item">Item</SelectItem>
                <SelectItem value="recipe">Recipe</SelectItem>
                <SelectItem value="menu_module">Menu Module</SelectItem>
                <SelectItem value="pricing_model">Pricing Model</SelectItem>
                <SelectItem value="quote">Quote</SelectItem>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="competitor">Competitor</SelectItem>
                <SelectItem value="brand_config">Brand Config</SelectItem>
                <SelectItem value="user">User / Access</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Actor</Label>
            <Select value={actor} onValueChange={setActor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {actors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 md:col-span-1">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState label="Loading audit events…" />
          ) : error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No audit events match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Timestamp</th>
                    <th className="p-3 font-medium">Event</th>
                    <th className="p-3 font-medium">Entity</th>
                    <th className="p-3 font-medium">Entity ID</th>
                    <th className="p-3 font-medium">Summary</th>
                    <th className="p-3 font-medium">Actor</th>
                    <th className="p-3 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="p-3"><Badge variant="outline" className="font-mono text-[10px]">{r.action}</Badge></td>
                      <td className="p-3 text-xs">{inferEntityType(r.action, r.details)}</td>
                      <td className="p-3 text-xs font-mono text-muted-foreground truncate max-w-[140px]">{inferEntityId(r.details)}</td>
                      <td className="p-3 text-xs max-w-[320px] truncate">{summarize(r)}</td>
                      <td className="p-3 text-xs">{r.actor_email ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-3">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit Event Detail</DialogTitle>
          </DialogHeader>
          {selected && <AuditDetail row={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditDetail({ row }: { row: AuditRow }) {
  const d = (row.details ?? {}) as Record<string, any>;
  const oldValue = d.previous_cost ?? d.old_value ?? d.previous_value ?? d.previous ?? null;
  const proposedValue = d.proposed_cost ?? d.proposed_value ?? d.proposed ?? null;
  const newValue = d.applied_cost ?? d.new_value ?? d.new ?? d.final_applied_cost ?? null;
  const pctChange = d.percent_change ?? d.pct_change ?? null;
  const source = d.source ?? d.match_source ?? d.new_match_source ?? null;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Timestamp</p>
          <p>{new Date(row.created_at).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Event</p>
          <Badge variant="outline" className="font-mono text-[10px]">{row.action}</Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Actor</p>
          <p>{row.actor_email ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Audit ID</p>
          <p className="font-mono text-xs break-all">{row.id}</p>
        </div>
      </div>

      {(oldValue != null || proposedValue != null || newValue != null || pctChange != null) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-md">
          {oldValue != null && (
            <div><p className="text-xs text-muted-foreground">Old</p><p className="font-mono">{String(oldValue)}</p></div>
          )}
          {proposedValue != null && (
            <div><p className="text-xs text-muted-foreground">Proposed</p><p className="font-mono">{String(proposedValue)}</p></div>
          )}
          {newValue != null && (
            <div><p className="text-xs text-muted-foreground">New / Applied</p><p className="font-mono">{String(newValue)}</p></div>
          )}
          {pctChange != null && (
            <div><p className="text-xs text-muted-foreground">% Change</p><p className="font-mono">{Number(pctChange).toFixed(2)}%</p></div>
          )}
        </div>
      )}

      {source && (
        <div>
          <p className="text-xs text-muted-foreground">Source</p>
          <Badge variant="secondary">{String(source)}</Badge>
        </div>
      )}

      <div>
        <p className="text-xs text-muted-foreground mb-1">Full metadata</p>
        <pre className="p-3 bg-muted/40 rounded-md text-xs overflow-auto max-h-80">
{JSON.stringify(row.details ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}

