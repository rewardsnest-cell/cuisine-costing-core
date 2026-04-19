import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ExternalLink, DollarSign, Handshake, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/affiliates")({
  head: () => ({ meta: [{ title: "Affiliates & Sponsorships — Admin" }] }),
  component: AffiliatesPage,
});

type Program = {
  id: string; name: string; network: string | null; affiliate_id: string | null;
  referral_link: string | null; commission_rate: number | null; commission_type: string;
  status: string; notes: string | null; created_at: string;
};
type Earning = {
  id: string; program_id: string; earned_on: string; amount: number;
  status: string; paid_on: string | null; reference: string | null; notes: string | null;
};
type Deal = {
  id: string; brand_name: string; contact_name: string | null; contact_email: string | null;
  deal_type: string | null; deal_value: number; currency: string; status: string;
  pitched_on: string | null; signed_on: string | null; delivered_on: string | null;
  invoiced_on: string | null; paid_on: string | null; notes: string | null;
};

const fmt = (n: number) => `$${(n ?? 0).toFixed(2)}`;

function AffiliatesPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [p, e, d] = await Promise.all([
      supabase.from("affiliate_programs").select("*").order("created_at", { ascending: false }),
      supabase.from("affiliate_earnings").select("*").order("earned_on", { ascending: false }),
      supabase.from("sponsorship_deals").select("*").order("pitched_on", { ascending: false, nullsFirst: false }),
    ]);
    setPrograms((p.data as any) || []);
    setEarnings((e.data as any) || []);
    setDeals((d.data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const totalEarned = earnings.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalPaid = earnings.filter(x => x.status === "paid").reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalPending = totalEarned - totalPaid;
  const dealsTotal = deals.reduce((s, x) => s + Number(x.deal_value || 0), 0);
  const dealsPaid = deals.filter(d => d.status === "paid").reduce((s, x) => s + Number(x.deal_value || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Affiliates & Sponsorships</h1>
          <p className="text-sm text-muted-foreground">Track programs you've joined and brand deals you've signed.</p>
        </div>
        <Link to="/admin/integrations"><Button variant="outline">API Integrations →</Button></Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Affiliate earned" value={fmt(totalEarned)} icon={<DollarSign className="w-4 h-4" />} />
        <StatCard label="Affiliate paid" value={fmt(totalPaid)} sub="received" />
        <StatCard label="Affiliate pending" value={fmt(totalPending)} sub="owed to you" />
        <StatCard label="Sponsorship total" value={fmt(dealsTotal)} sub={`${fmt(dealsPaid)} paid`} icon={<Handshake className="w-4 h-4" />} />
      </div>

      <Tabs defaultValue="programs">
        <TabsList>
          <TabsTrigger value="programs">Programs ({programs.length})</TabsTrigger>
          <TabsTrigger value="earnings">Earnings ({earnings.length})</TabsTrigger>
          <TabsTrigger value="deals">Sponsorship Deals ({deals.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="space-y-3">
          <div className="flex justify-end"><ProgramDialog onSaved={load} /></div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Network</TableHead>
                <TableHead>Affiliate ID</TableHead><TableHead>Commission</TableHead>
                <TableHead>Status</TableHead><TableHead>Link</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  : programs.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No programs yet</TableCell></TableRow>
                  : programs.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.network || "—"}</TableCell>
                    <TableCell className="text-sm font-mono">{p.affiliate_id || "—"}</TableCell>
                    <TableCell className="text-sm">{p.commission_rate ? `${p.commission_rate}${p.commission_type === "percent" ? "%" : " " + p.commission_type}` : "—"}</TableCell>
                    <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                    <TableCell>{p.referral_link ? <a href={p.referral_link} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-sm"><ExternalLink className="w-3 h-3" />open</a> : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <ProgramDialog program={p} onSaved={load} />
                        <Button size="sm" variant="ghost" onClick={async () => {
                          if (!confirm(`Delete ${p.name}?`)) return;
                          await supabase.from("affiliate_programs").delete().eq("id", p.id);
                          toast.success("Deleted"); load();
                        }}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="earnings" className="space-y-3">
          <div className="flex justify-end"><EarningDialog programs={programs} onSaved={load} /></div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Program</TableHead><TableHead>Amount</TableHead>
                <TableHead>Status</TableHead><TableHead>Paid On</TableHead><TableHead>Reference</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {earnings.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No earnings logged</TableCell></TableRow>
                  : earnings.map(e => {
                  const prog = programs.find(p => p.id === e.program_id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{e.earned_on}</TableCell>
                      <TableCell className="font-medium">{prog?.name || "—"}</TableCell>
                      <TableCell className="font-medium">{fmt(Number(e.amount))}</TableCell>
                      <TableCell><Badge variant={e.status === "paid" ? "default" : "secondary"}>{e.status}</Badge></TableCell>
                      <TableCell className="text-sm">{e.paid_on || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.reference || "—"}</TableCell>
                      <TableCell className="text-right">
                        {e.status !== "paid" && (
                          <Button size="sm" variant="outline" onClick={async () => {
                            await supabase.from("affiliate_earnings").update({ status: "paid", paid_on: new Date().toISOString().slice(0, 10) }).eq("id", e.id);
                            toast.success("Marked paid"); load();
                          }}>Mark paid</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={async () => {
                          if (!confirm("Delete entry?")) return;
                          await supabase.from("affiliate_earnings").delete().eq("id", e.id);
                          load();
                        }}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="deals" className="space-y-3">
          <div className="flex justify-end"><DealDialog onSaved={load} /></div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Brand</TableHead><TableHead>Type</TableHead><TableHead>Value</TableHead>
                <TableHead>Status</TableHead><TableHead>Pitched</TableHead><TableHead>Paid</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {deals.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No deals yet</TableCell></TableRow>
                  : deals.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.brand_name}<div className="text-xs text-muted-foreground">{d.contact_email}</div></TableCell>
                    <TableCell className="text-sm">{d.deal_type || "—"}</TableCell>
                    <TableCell className="font-medium">{fmt(Number(d.deal_value))}</TableCell>
                    <TableCell><DealStatusSelect deal={d} onChanged={load} /></TableCell>
                    <TableCell className="text-sm">{d.pitched_on || "—"}</TableCell>
                    <TableCell className="text-sm">{d.paid_on || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!confirm(`Delete ${d.brand_name}?`)) return;
                        await supabase.from("sponsorship_deals").delete().eq("id", d.id);
                        load();
                      }}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>{label}</span>{icon}
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ProgramDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", network: "", affiliate_id: "", referral_link: "", commission_rate: "", commission_type: "percent", status: "active", notes: "" });
  const submit = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    const { error } = await supabase.from("affiliate_programs").insert({
      name: form.name.trim(),
      network: form.network || null,
      affiliate_id: form.affiliate_id || null,
      referral_link: form.referral_link || null,
      commission_rate: form.commission_rate ? Number(form.commission_rate) : null,
      commission_type: form.commission_type,
      status: form.status,
      notes: form.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Program added");
    setOpen(false);
    setForm({ name: "", network: "", affiliate_id: "", referral_link: "", commission_rate: "", commission_type: "percent", status: "active", notes: "" });
    onSaved();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />Add Program</Button></DialogTrigger>
      <DialogContent><DialogHeader><DialogTitle>New Affiliate Program</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Amazon Associates" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Network</Label><Input value={form.network} onChange={e => setForm({ ...form, network: e.target.value })} placeholder="Amazon, ShareASale" /></div>
            <div><Label>Your Affiliate ID</Label><Input value={form.affiliate_id} onChange={e => setForm({ ...form, affiliate_id: e.target.value })} /></div>
          </div>
          <div><Label>Referral Link</Label><Input value={form.referral_link} onChange={e => setForm({ ...form, referral_link: e.target.value })} placeholder="https://…" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Rate</Label><Input type="number" step="0.01" value={form.commission_rate} onChange={e => setForm({ ...form, commission_rate: e.target.value })} /></div>
            <div><Label>Type</Label>
              <Select value={form.commission_type} onValueChange={v => setForm({ ...form, commission_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="percent">%</SelectItem><SelectItem value="flat">flat $</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="paused">paused</SelectItem>
                  <SelectItem value="ended">ended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <Button onClick={submit} className="w-full">Save Program</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EarningDialog({ programs, onSaved }: { programs: Program[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ program_id: "", earned_on: new Date().toISOString().slice(0, 10), amount: "", status: "pending", reference: "", notes: "" });
  const submit = async () => {
    if (!form.program_id) return toast.error("Pick a program");
    if (!form.amount) return toast.error("Amount required");
    const { error } = await supabase.from("affiliate_earnings").insert({
      program_id: form.program_id,
      earned_on: form.earned_on,
      amount: Number(form.amount),
      status: form.status,
      reference: form.reference || null,
      notes: form.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Earning logged");
    setOpen(false);
    setForm({ program_id: "", earned_on: new Date().toISOString().slice(0, 10), amount: "", status: "pending", reference: "", notes: "" });
    onSaved();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />Log Earning</Button></DialogTrigger>
      <DialogContent><DialogHeader><DialogTitle>Log Affiliate Earning</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Program *</Label>
            <Select value={form.program_id} onValueChange={v => setForm({ ...form, program_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{programs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Earned On</Label><Input type="date" value={form.earned_on} onChange={e => setForm({ ...form, earned_on: e.target.value })} /></div>
            <div><Label>Amount *</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="paid">paid</SelectItem>
                  <SelectItem value="reversed">reversed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference</Label><Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Order ID" /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <Button onClick={submit} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DealDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ brand_name: "", contact_name: "", contact_email: "", deal_type: "", deal_value: "", currency: "USD", status: "pitched", notes: "" });
  const submit = async () => {
    if (!form.brand_name.trim()) return toast.error("Brand required");
    const { error } = await supabase.from("sponsorship_deals").insert({
      brand_name: form.brand_name.trim(),
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      deal_type: form.deal_type || null,
      deal_value: form.deal_value ? Number(form.deal_value) : 0,
      currency: form.currency,
      status: form.status,
      notes: form.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Deal added");
    setOpen(false);
    setForm({ brand_name: "", contact_name: "", contact_email: "", deal_type: "", deal_value: "", currency: "USD", status: "pitched", notes: "" });
    onSaved();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />Add Deal</Button></DialogTrigger>
      <DialogContent><DialogHeader><DialogTitle>New Sponsorship Deal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Brand *</Label><Input value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
            <div><Label>Contact Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Type</Label><Input value={form.deal_type} onChange={e => setForm({ ...form, deal_type: e.target.value })} placeholder="Sponsored post, kickback…" /></div>
            <div><Label>Value</Label><Input type="number" step="0.01" value={form.deal_value} onChange={e => setForm({ ...form, deal_value: e.target.value })} /></div>
          </div>
          <div><Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pitched">pitched</SelectItem>
                <SelectItem value="signed">signed</SelectItem>
                <SelectItem value="delivered">delivered</SelectItem>
                <SelectItem value="invoiced">invoiced</SelectItem>
                <SelectItem value="paid">paid</SelectItem>
                <SelectItem value="lost">lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <Button onClick={submit} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DealStatusSelect({ deal, onChanged }: { deal: Deal; onChanged: () => void }) {
  return (
    <Select value={deal.status} onValueChange={async (v) => {
      const patch: any = { status: v };
      const today = new Date().toISOString().slice(0, 10);
      if (v === "signed" && !deal.signed_on) patch.signed_on = today;
      if (v === "delivered" && !deal.delivered_on) patch.delivered_on = today;
      if (v === "invoiced" && !deal.invoiced_on) patch.invoiced_on = today;
      if (v === "paid" && !deal.paid_on) patch.paid_on = today;
      const { error } = await supabase.from("sponsorship_deals").update(patch).eq("id", deal.id);
      if (error) toast.error(error.message); else { toast.success(`Status: ${v}`); onChanged(); }
    }}>
      <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {["pitched", "signed", "delivered", "invoiced", "paid", "lost"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
