import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Plus, ExternalLink, FileSearch, Pencil, Globe, Phone, Mail, Trophy, X as XIcon, Clock } from "lucide-react";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/competitors")({
  head: () => ({
    meta: [
      { title: "Competitors — Admin" },
      { name: "description", content: "All competitor businesses tracked across uploaded quotes." },
    ],
  }),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8 text-center space-y-3">
      <PageHelpCard route="/admin/competitors" />
        <p className="text-destructive">Couldn't load competitors: {error.message}</p>
        <Button onClick={() => { router.invalidate(); reset(); }}>Retry</Button>
      </div>
    );
  },
  component: CompetitorsPage,
});

type Competitor = {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

type QuoteSummary = {
  competitor_id: string | null;
  competitor_name: string | null;
  outcome: "pending" | "won" | "lost";
  total: number | null;
  guest_count: number | null;
};

function CompetitorsPage() {
  const [loading, setLoading] = useState(true);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Competitor | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: comps, error: e1 }, { data: qs, error: e2 }] = await Promise.all([
      supabase.from("competitors" as any).select("*").order("last_seen_at", { ascending: false }),
      supabase.from("competitor_quotes").select("competitor_id,competitor_name,outcome,total,guest_count"),
    ]);
    if (e1) toast.error(e1.message);
    if (e2) toast.error(e2.message);
    setCompetitors(((comps ?? []) as unknown) as Competitor[]);
    setQuotes(((qs ?? []) as unknown) as QuoteSummary[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const statsByCompetitor = useMemo(() => {
    const map = new Map<string, { count: number; won: number; lost: number; pending: number; avgTotal: number; avgPerGuest: number }>();
    for (const c of competitors) {
      map.set(c.id, { count: 0, won: 0, lost: 0, pending: 0, avgTotal: 0, avgPerGuest: 0 });
    }
    const totalsByC = new Map<string, number[]>();
    const perGuestByC = new Map<string, number[]>();
    for (const q of quotes) {
      if (!q.competitor_id) continue;
      const s = map.get(q.competitor_id);
      if (!s) continue;
      s.count += 1;
      if (q.outcome === "won") s.won += 1;
      else if (q.outcome === "lost") s.lost += 1;
      else s.pending += 1;
      if (q.total != null && Number(q.total) > 0) {
        const arr = totalsByC.get(q.competitor_id) ?? [];
        arr.push(Number(q.total));
        totalsByC.set(q.competitor_id, arr);
        if (q.guest_count && Number(q.guest_count) > 0) {
          const pg = perGuestByC.get(q.competitor_id) ?? [];
          pg.push(Number(q.total) / Number(q.guest_count));
          perGuestByC.set(q.competitor_id, pg);
        }
      }
    }
    for (const [id, arr] of totalsByC) {
      const s = map.get(id);
      if (s) s.avgTotal = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    for (const [id, arr] of perGuestByC) {
      const s = map.get(id);
      if (s) s.avgPerGuest = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    return map;
  }, [competitors, quotes]);

  const filtered = useMemo(() => {
    if (!search.trim()) return competitors;
    const q = search.toLowerCase();
    return competitors.filter((c) =>
      `${c.name} ${c.website ?? ""} ${c.email ?? ""} ${c.phone ?? ""} ${c.notes ?? ""}`.toLowerCase().includes(q),
    );
  }, [competitors, search]);

  const fmtMoney = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6" /> Competitors
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-tracked from every uploaded competitor quote. Add contact details and notes per competitor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCreating(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add competitor
          </Button>
          <Link to="/admin/competitor-quotes">
            <Button variant="outline" className="gap-2">
              <FileSearch className="w-4 h-4" /> Quotes
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Search</CardTitle></CardHeader>
        <CardContent>
          <Input
            placeholder="Filter by name, website, email, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {competitors.length === 0
                ? "No competitors yet. They'll appear automatically when you upload competitor quotes."
                : "No competitors match your search."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competitor</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Quotes</TableHead>
                  <TableHead>Outcomes</TableHead>
                  <TableHead className="text-right">Avg total</TableHead>
                  <TableHead className="text-right">Avg / guest</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const s = statsByCompetitor.get(c.id) ?? { count: 0, won: 0, lost: 0, pending: 0, avgTotal: 0, avgPerGuest: 0 };
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">First seen {fmtDate(c.first_seen_at)}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="space-y-0.5">
                          {c.website && (
                            <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                               target="_blank" rel="noreferrer"
                               className="text-primary inline-flex items-center gap-1 hover:underline">
                              <Globe className="w-3 h-3" /> {c.website.replace(/^https?:\/\//, "")}
                            </a>
                          )}
                          {c.phone && (
                            <div className="text-muted-foreground inline-flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {c.phone}
                            </div>
                          )}
                          {c.email && (
                            <div className="text-muted-foreground inline-flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {c.email}
                            </div>
                          )}
                          {!c.website && !c.phone && !c.email && (
                            <span className="text-xs text-muted-foreground italic">No contact info</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{s.count}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {s.won > 0 && (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-[10px]">
                              <Trophy className="w-2.5 h-2.5 mr-0.5" />{s.won}
                            </Badge>
                          )}
                          {s.lost > 0 && (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-[10px]">
                              <XIcon className="w-2.5 h-2.5 mr-0.5" />{s.lost}
                            </Badge>
                          )}
                          {s.pending > 0 && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">
                              <Clock className="w-2.5 h-2.5 mr-0.5" />{s.pending}
                            </Badge>
                          )}
                          {s.count === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {s.avgTotal > 0 ? fmtMoney(s.avgTotal) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {s.avgPerGuest > 0 ? fmtMoney(s.avgPerGuest) : "—"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{fmtDate(c.last_seen_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setEditing(c)}>
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </Button>
                          <Link
                            to="/admin/competitor-quotes"
                            search={{ competitor: c.name } as any}
                          >
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                              <ExternalLink className="w-3.5 h-3.5" /> Quotes
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CompetitorDialog
        open={!!editing || creating}
        competitor={editing}
        onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }}
        onSaved={() => { setEditing(null); setCreating(false); load(); }}
      />
    </div>
  );
}

function CompetitorDialog({
  open, competitor, onOpenChange, onSaved,
}: {
  open: boolean;
  competitor: Competitor | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(competitor?.name ?? "");
      setWebsite(competitor?.website ?? "");
      setPhone(competitor?.phone ?? "");
      setEmail(competitor?.email ?? "");
      setNotes(competitor?.notes ?? "");
    }
  }, [open, competitor]);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        name_normalized: name.trim().toLowerCase().replace(/\s+/g, " "),
        website: website.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      };
      if (competitor) {
        const { error } = await supabase.from("competitors" as any).update(payload).eq("id", competitor.id);
        if (error) throw error;
        toast.success("Competitor updated");
      } else {
        const { error } = await supabase.from("competitors" as any).insert(payload);
        if (error) throw error;
        toast.success("Competitor added");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{competitor ? "Edit competitor" : "Add competitor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Catering" />
          </div>
          <div>
            <Label className="text-xs">Website</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Pricing approach, strengths, weaknesses…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
