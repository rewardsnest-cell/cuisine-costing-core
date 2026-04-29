import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Calendar, FileText, Receipt, CreditCard, CheckCircle2, Plus,
  PackageCheck, Loader2, Download, ArrowRight, ShieldCheck,
} from "lucide-react";
import {
  lifecycleListEvents,
  lifecycleListQuotes,
  lifecycleListInvoices,
  lifecycleListReceipts,
  lifecycleCreateEvent,
  lifecycleCreateQuote,
  lifecycleApproveQuote,
  lifecycleGenerateInvoice,
  lifecycleMarkInvoicePaid,
  lifecycleGenerateReceipt,
  lifecycleEventPackage,
  quoteIngestUnstructured,
  quoteSetStatus,
  quoteGetFull,
  quoteMarkSent,
} from "@/lib/server-fns/event-lifecycle.functions";
import {
  generateVpsfinestQuotePDF,
  type QuoteSection,
  SECTION_LABEL,
  SECTION_ORDER,
} from "@/lib/admin/vpsfinest-quote-pdf";
import { sendTransactionalEmail } from "@/lib/email/send";
import { Wand2, Mail } from "lucide-react";

type Event = {
  id: string; name: string; event_date: string | null; guest_count: number | null;
  customer_name: string | null; customer_email: string | null; customer_phone: string | null;
  customer_org: string | null; status: string;
};
type Quote = {
  id: string; reference_number: string | null; client_name: string | null;
  event_date: string | null; guest_count: number | null; total: number | null;
  quote_state: string; status: string; cqh_event_id: string | null;
};
type Invoice = {
  id: string; invoice_number: string | null; quote_id: string; cqh_event_id: string;
  issue_date: string; due_date: string | null; total: number; amount_paid: number;
  balance_due: number; status: string;
};
type Receipt = {
  id: string; receipt_number: string | null; invoice_id: string; quote_id: string;
  cqh_event_id: string; paid_at: string; amount: number; payment_method: string | null;
};

export function LifecyclePanel() {
  const listEvents   = useServerFn(lifecycleListEvents);
  const listQuotes   = useServerFn(lifecycleListQuotes);
  const listInvoices = useServerFn(lifecycleListInvoices);
  const listReceipts = useServerFn(lifecycleListReceipts);
  const createEvent  = useServerFn(lifecycleCreateEvent);
  const createQuote  = useServerFn(lifecycleCreateQuote);
  const approveQuote = useServerFn(lifecycleApproveQuote);
  const genInvoice   = useServerFn(lifecycleGenerateInvoice);
  const markPaid     = useServerFn(lifecycleMarkInvoicePaid);
  const genReceipt   = useServerFn(lifecycleGenerateReceipt);
  const eventPackage = useServerFn(lifecycleEventPackage);
  const ingest       = useServerFn(quoteIngestUnstructured);
  const setStatus    = useServerFn(quoteSetStatus);
  const getFull      = useServerFn(quoteGetFull);
  const markSent     = useServerFn(quoteMarkSent);

  const [loading, setLoading] = useState(true);
  const [events, setEvents]     = useState<Event[]>([]);
  const [quotes, setQuotes]     = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const [busy, setBusy] = useState<string | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [ingestDialogFor, setIngestDialogFor] = useState<Event | null>(null);
  const [payDialogFor, setPayDialogFor] = useState<Invoice | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [e, q, i, r] = await Promise.all([
        listEvents(), listQuotes(), listInvoices(), listReceipts(),
      ]);
      setEvents(e.events as Event[]);
      setQuotes(q.quotes as Quote[]);
      setInvoices(i.invoices as Invoice[]);
      setReceipts(r.receipts as Receipt[]);
    } catch (err: any) {
      toast.error(err.message || "Failed to load lifecycle data");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const eventById = (id: string | null) => events.find((e) => e.id === id);
  const invoicesForQuote = (qid: string) => invoices.filter((i) => i.quote_id === qid);
  const receiptsForInvoice = (iid: string) => receipts.filter((r) => r.invoice_id === iid);

  const onApprove = async (q: Quote) => {
    setBusy(q.id);
    try { await approveQuote({ data: { quote_id: q.id } }); toast.success("Quote approved"); await refresh(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const onInvoice = async (q: Quote) => {
    setBusy(q.id);
    try {
      const r = await genInvoice({ data: { quote_id: q.id, due_in_days: 14 } });
      toast.success(`Invoice ${r.invoice.invoice_number} generated`);
      await refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const onReceipt = async (inv: Invoice) => {
    setBusy(inv.id);
    try {
      const r = await genReceipt({ data: { invoice_id: inv.id, payment_method: "other" } });
      toast.success(`Receipt ${r.receipt.receipt_number} generated`);
      await refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const onExportPackage = async (eventId: string) => {
    setBusy(eventId);
    try {
      const pkg = await eventPackage({ data: { cqh_event_id: eventId } });
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `event-${(pkg.event as any).name?.replace(/\W+/g, "-") ?? eventId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Event package downloaded");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  if (loading) {
    return <Card><CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading lifecycle…
    </CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      {/* Header / actions */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Customer · Event · Quote · Invoice · Receipt
            </CardTitle>
            <CardDescription>
              Every quote is anchored to an event. Approval, invoicing, payment, and receipts
              flow forward from there with the customer/event link locked at the database level.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEventDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> New Event + Customer
            </Button>
            <Button onClick={() => setQuoteDialogOpen(true)} disabled={events.length === 0}>
              <Plus className="w-4 h-4 mr-1" /> New Quote
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Events</CardTitle>
          <CardDescription>
            Every event carries the customer record. Quotes / invoices / receipts inherit from here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Event</TableHead><TableHead>Customer</TableHead>
                <TableHead>Date</TableHead><TableHead>Guests</TableHead>
                <TableHead>Quotes</TableHead><TableHead className="w-32"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No events yet — create one to start the lifecycle.
                  </TableCell></TableRow>
                )}
                {events.map((e) => {
                  const evQuotes = quotes.filter((q) => q.cqh_event_id === e.id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="text-sm">
                        <div>{e.customer_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{e.customer_email ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-sm">{e.event_date ?? "—"}</TableCell>
                      <TableCell className="text-sm">{e.guest_count ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{evQuotes.length}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => onExportPackage(e.id)}
                          disabled={busy === e.id}>
                          {busy === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          <span className="ml-1">Package</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Quotes / chain */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4" /> Quote → Invoice → Receipt</CardTitle>
          <CardDescription>Workflow gates are enforced at the database level.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Quote</TableHead><TableHead>Event</TableHead>
                <TableHead>State</TableHead><TableHead>Total</TableHead>
                <TableHead>Invoice</TableHead><TableHead>Receipt</TableHead>
                <TableHead className="w-72">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {quotes.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    No quotes yet.
                  </TableCell></TableRow>
                )}
                {quotes.map((q) => {
                  const ev = eventById(q.cqh_event_id);
                  const invs = invoicesForQuote(q.id);
                  const inv = invs[0]; // 1:1 by current rule
                  const rcpts = inv ? receiptsForInvoice(inv.id) : [];
                  const rcpt = rcpts[0];
                  return (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono text-xs">{q.reference_number ?? q.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-sm">
                        {ev ? <>
                          <div>{ev.name}</div>
                          <div className="text-xs text-muted-foreground">{ev.customer_name}</div>
                        </> : <span className="text-destructive text-xs">unlinked</span>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{q.quote_state}</Badge></TableCell>
                      <TableCell className="text-sm">${Number(q.total ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">
                        {inv
                          ? <div>
                              <div className="font-mono">{inv.invoice_number}</div>
                              <Badge variant={inv.status === "paid" ? "default" : "secondary"} className="mt-0.5">{inv.status}</Badge>
                            </div>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {rcpt ? rcpt.receipt_number : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {q.quote_state !== "approved" && q.quote_state !== "invoiced" && q.quote_state !== "paid" && (
                            <Button size="sm" variant="outline" onClick={() => onApprove(q)} disabled={busy === q.id || !q.cqh_event_id}>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                            </Button>
                          )}
                          {q.quote_state === "approved" && !inv && (
                            <Button size="sm" onClick={() => onInvoice(q)} disabled={busy === q.id}>
                              <Receipt className="w-3 h-3 mr-1" /> Invoice
                            </Button>
                          )}
                          {inv && inv.status !== "paid" && (
                            <Button size="sm" variant="outline" onClick={() => setPayDialogFor(inv)}>
                              <CreditCard className="w-3 h-3 mr-1" /> Mark Paid
                            </Button>
                          )}
                          {inv && inv.status === "paid" && !rcpt && (
                            <Button size="sm" onClick={() => onReceipt(inv)} disabled={busy === inv.id}>
                              <PackageCheck className="w-3 h-3 mr-1" /> Receipt
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <NewEventDialog
        open={eventDialogOpen}
        onClose={() => setEventDialogOpen(false)}
        onCreated={async () => { setEventDialogOpen(false); await refresh(); }}
        createFn={createEvent}
      />
      <NewQuoteDialog
        open={quoteDialogOpen}
        onClose={() => setQuoteDialogOpen(false)}
        onCreated={async () => { setQuoteDialogOpen(false); await refresh(); }}
        createFn={createQuote}
        events={events}
      />
      <PayInvoiceDialog
        invoice={payDialogFor}
        onClose={() => setPayDialogFor(null)}
        onPaid={async () => { setPayDialogFor(null); await refresh(); }}
        markPaid={markPaid}
      />
    </div>
  );
}

// ---------- Dialogs ----------

function NewEventDialog({ open, onClose, onCreated, createFn }: any) {
  const [form, setForm] = useState({
    name: "", event_date: "", guest_count: "", customer_name: "",
    customer_email: "", customer_phone: "", customer_org: "",
    billing_address: "", customer_notes: "",
    event_location_name: "", event_location_addr: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.customer_name.trim()) {
      toast.error("Event name + customer name are required"); return;
    }
    setSaving(true);
    try {
      await createFn({ data: {
        name: form.name.trim(),
        event_date: form.event_date || null,
        guest_count: form.guest_count ? Number(form.guest_count) : null,
        customer_name: form.customer_name.trim(),
        customer_email: form.customer_email.trim() || null,
        customer_phone: form.customer_phone.trim() || null,
        customer_org: form.customer_org.trim() || null,
        billing_address: form.billing_address.trim() || null,
        customer_notes: form.customer_notes.trim() || null,
        event_location_name: form.event_location_name.trim() || null,
        event_location_addr: form.event_location_addr.trim() || null,
      }});
      toast.success("Event created");
      onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Event + Customer</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Event Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Event Date</Label>
            <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></div>
          <div><Label>Guest Count</Label>
            <Input type="number" min={1} value={form.guest_count}
              onChange={(e) => setForm({ ...form, guest_count: e.target.value })} /></div>
          <div className="col-span-2 border-t pt-3 mt-1 text-sm font-semibold">Customer</div>
          <div><Label>Customer Name *</Label>
            <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
          <div><Label>Organization</Label>
            <Input value={form.customer_org} onChange={(e) => setForm({ ...form, customer_org: e.target.value })} /></div>
          <div><Label>Email</Label>
            <Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} /></div>
          <div><Label>Phone</Label>
            <Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
          <div className="col-span-2"><Label>Billing Address</Label>
            <Textarea rows={2} value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} /></div>
          <div><Label>Event Location Name</Label>
            <Input value={form.event_location_name} onChange={(e) => setForm({ ...form, event_location_name: e.target.value })} /></div>
          <div><Label>Event Location Address</Label>
            <Input value={form.event_location_addr} onChange={(e) => setForm({ ...form, event_location_addr: e.target.value })} /></div>
          <div className="col-span-2"><Label>Customer Notes</Label>
            <Textarea rows={2} value={form.customer_notes} onChange={(e) => setForm({ ...form, customer_notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewQuoteDialog({ open, onClose, onCreated, createFn, events }: any) {
  const [eventId, setEventId] = useState<string>("");
  const [taxRate, setTaxRate] = useState("0.08");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ name: string; quantity: string; unit_price: string }[]>([
    { name: "", quantity: "1", unit_price: "0" },
  ]);
  const [saving, setSaving] = useState(false);

  const total = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

  const submit = async () => {
    if (!eventId) { toast.error("Pick an event"); return; }
    setSaving(true);
    try {
      const cleanItems = items
        .filter((it) => it.name.trim())
        .map((it) => ({
          name: it.name.trim(),
          quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
          unit_price: Math.max(0, Number(it.unit_price) || 0),
        }));
      const r = await createFn({ data: {
        cqh_event_id: eventId,
        tax_rate: Number(taxRate) || 0,
        notes: notes.trim() || null,
        items: cleanItems,
      }});
      toast.success(`Quote ${r.quote.reference_number} created (DRAFT)`);
      onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Quote</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Event *</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger><SelectValue placeholder="Pick an event…" /></SelectTrigger>
              <SelectContent>
                {events.map((e: Event) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} — {e.customer_name ?? "no customer"}{e.event_date ? ` · ${e.event_date}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Tax Rate</Label>
              <Input type="number" step="0.01" min="0" max="1" value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)} /></div>
            <div className="text-right pt-6 text-sm">
              Total: <span className="font-mono font-semibold">
                ${(total * (1 + (Number(taxRate) || 0))).toFixed(2)}
              </span>
            </div>
          </div>
          <div>
            <Label>Line Items</Label>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_100px_auto] gap-2">
                  <Input placeholder="Item name" value={it.name}
                    onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
                  <Input type="number" min={1} value={it.quantity}
                    onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
                  <Input type="number" min={0} step="0.01" value={it.unit_price}
                    onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, unit_price: e.target.value } : x))} />
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}>×</Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm"
                onClick={() => setItems([...items, { name: "", quantity: "1", unit_price: "0" }])}>
                <Plus className="w-3 h-3 mr-1" /> Add line
              </Button>
            </div>
          </div>
          <div><Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !eventId}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Create Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayInvoiceDialog({ invoice, onClose, onPaid, markPaid }: any) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "check" | "wire" | "other">("card");
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (invoice) setAmount(String(Number(invoice.balance_due ?? 0).toFixed(2)));
  }, [invoice]);

  if (!invoice) return null;

  const submit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a positive amount"); return; }
    setSaving(true);
    try {
      const r = await markPaid({ data: {
        invoice_id: invoice.id, amount: amt, payment_method: method,
        reference_note: ref.trim() || null,
      }});
      toast.success(`Recorded — invoice ${r.status}, balance $${r.balance_due.toFixed(2)}`);
      onPaid();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Mark Invoice Paid</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border p-3 bg-muted/30">
            <div>Invoice <span className="font-mono">{invoice.invoice_number}</span></div>
            <div>Total: ${Number(invoice.total).toFixed(2)} · Paid: ${Number(invoice.amount_paid).toFixed(2)} · Balance: ${Number(invoice.balance_due).toFixed(2)}</div>
          </div>
          <div><Label>Amount</Label>
            <Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["cash", "card", "check", "wire", "other"].map((m) => (
                  <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Reference / note</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="check #, txn id…" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
