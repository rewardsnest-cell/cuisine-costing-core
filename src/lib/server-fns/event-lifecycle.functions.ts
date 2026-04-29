// VPSFinest event-lifecycle: customer ↔ event ↔ quote ↔ invoice ↔ receipt.
// All functions require an admin user. Workflow gates are also enforced at
// the database layer via triggers (see 20260429 migration).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(`Auth check failed: ${error.message}`);
  if (!data) throw new Error("Admin role required");
}

function genRef(prefix: string) {
  // 6 chars uppercase alphanumeric, no ambiguous chars (0/O/1/I)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}-${out}`;
}

// ---------- Read: list events / quotes ----------

export const lifecycleListEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("cqh_events")
      .select(
        "id, name, event_date, guest_count, status, customer_name, customer_email, customer_phone, customer_org, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { events: data ?? [] };
  });

export const lifecycleListQuotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("quotes")
      .select(
        "id, reference_number, client_name, event_date, guest_count, total, quote_state, status, cqh_event_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { quotes: data ?? [] };
  });

export const lifecycleListInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select(
        "id, invoice_number, quote_id, cqh_event_id, issue_date, due_date, total, amount_paid, balance_due, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { invoices: data ?? [] };
  });

export const lifecycleListReceipts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("customer_payment_receipts")
      .select(
        "id, receipt_number, invoice_id, quote_id, cqh_event_id, paid_at, amount, payment_method, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { receipts: data ?? [] };
  });

// ---------- Create event (with customer fields) ----------

const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  event_date: z.string().optional().nullable(),
  guest_count: z.number().int().positive().optional().nullable(),
  customer_name: z.string().min(1).max(200),
  customer_email: z.string().email().max(200).optional().nullable(),
  customer_phone: z.string().max(60).optional().nullable(),
  customer_org: z.string().max(200).optional().nullable(),
  billing_address: z.string().max(500).optional().nullable(),
  customer_notes: z.string().max(1000).optional().nullable(),
  event_location_name: z.string().max(200).optional().nullable(),
  event_location_addr: z.string().max(500).optional().nullable(),
});

export const lifecycleCreateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createEventSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("cqh_events")
      .insert({
        name: data.name,
        event_date: data.event_date || null,
        guest_count: data.guest_count ?? null,
        customer_name: data.customer_name,
        customer_email: data.customer_email || null,
        customer_phone: data.customer_phone || null,
        customer_org: data.customer_org || null,
        billing_address: data.billing_address || null,
        customer_notes: data.customer_notes || null,
        event_location_name: data.event_location_name || null,
        event_location_addr: data.event_location_addr || null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { event: row };
  });

// ---------- Create quote (linked to event) ----------

const createQuoteSchema = z.object({
  cqh_event_id: z.string().uuid(),
  notes: z.string().max(2000).optional().nullable(),
  tax_rate: z.number().min(0).max(1).optional(),
  items: z.array(z.object({
    name: z.string().min(1).max(300),
    quantity: z.number().int().positive().default(1),
    unit_price: z.number().min(0).default(0),
  })).min(0).max(200).default([]),
});

export const lifecycleCreateQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createQuoteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Pull event so we can copy denormalized client info onto the quote.
    const { data: ev, error: evErr } = await supabaseAdmin
      .from("cqh_events")
      .select("id, name, event_date, guest_count, customer_name, customer_email, customer_phone, event_location_name, event_location_addr")
      .eq("id", data.cqh_event_id)
      .maybeSingle();
    if (evErr) throw new Error(evErr.message);
    if (!ev) throw new Error("Event not found");

    const taxRate = data.tax_rate ?? 0.08;
    const subtotal = data.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    const total = +(subtotal * (1 + taxRate)).toFixed(2);

    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .insert({
        cqh_event_id: ev.id,
        reference_number: genRef("TQ"),
        client_name: ev.customer_name ?? null,
        client_email: ev.customer_email ?? null,
        client_phone: ev.customer_phone ?? null,
        event_date: ev.event_date ?? null,
        guest_count: ev.guest_count ?? 1,
        location_name: ev.event_location_name ?? null,
        location_address: ev.event_location_addr ?? null,
        notes: data.notes ?? null,
        subtotal,
        tax_rate: taxRate,
        total,
        status: "draft",
        quote_state: "structured",
        user_id: context.userId,
        source: "lifecycle",
      })
      .select("*")
      .single();
    if (qErr) throw new Error(qErr.message);

    if (data.items.length > 0) {
      const rows = data.items.map((it) => ({
        quote_id: quote.id,
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: +(it.quantity * it.unit_price).toFixed(2),
      }));
      const { error: liErr } = await supabaseAdmin.from("quote_items").insert(rows);
      if (liErr) throw new Error(`Quote line items failed: ${liErr.message}`);
    }

    return { quote };
  });

// ---------- Approve quote ----------

export const lifecycleApproveQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ quote_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: q, error: qe } = await supabaseAdmin
      .from("quotes")
      .select("id, cqh_event_id, quote_state")
      .eq("id", data.quote_id)
      .maybeSingle();
    if (qe) throw new Error(qe.message);
    if (!q) throw new Error("Quote not found");
    if (!q.cqh_event_id) throw new Error("Quote is not linked to an event — cannot approve");

    const { error: upErr } = await supabaseAdmin
      .from("quotes")
      .update({ quote_state: "approved", status: "approved" })
      .eq("id", data.quote_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

// ---------- Generate invoice from approved quote ----------

export const lifecycleGenerateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      quote_id: z.string().uuid(),
      due_in_days: z.number().int().min(0).max(365).default(14),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: q, error: qe } = await supabaseAdmin
      .from("quotes")
      .select("id, cqh_event_id, quote_state, subtotal, tax_rate, total")
      .eq("id", data.quote_id)
      .maybeSingle();
    if (qe) throw new Error(qe.message);
    if (!q) throw new Error("Quote not found");
    if (!q.cqh_event_id) throw new Error("Quote is not linked to an event");
    if (q.quote_state !== "approved") {
      throw new Error(`Quote must be approved (current state: ${q.quote_state})`);
    }

    // Reject if an invoice already exists for this quote — keep the chain clean.
    const { count } = await supabaseAdmin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", data.quote_id);
    if ((count ?? 0) > 0) throw new Error("An invoice already exists for this quote");

    const subtotal = Number(q.subtotal ?? 0);
    const taxRate = Number(q.tax_rate ?? 0.08);
    const taxAmount = +(subtotal * taxRate).toFixed(2);
    const total = +(subtotal + taxAmount).toFixed(2);
    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + data.due_in_days * 86_400_000);

    const { data: inv, error: invErr } = await supabaseAdmin
      .from("invoices")
      .insert({
        invoice_number: genRef("INV"),
        quote_id: q.id,
        cqh_event_id: q.cqh_event_id,
        issue_date: issueDate.toISOString().slice(0, 10),
        due_date: dueDate.toISOString().slice(0, 10),
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        amount_paid: 0,
        status: "unpaid",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (invErr) throw new Error(invErr.message);

    // Copy quote line items into invoice_items.
    const { data: items } = await supabaseAdmin
      .from("quote_items")
      .select("id, name, quantity, unit_price, total_price")
      .eq("quote_id", q.id);

    if ((items ?? []).length > 0) {
      const rows = (items ?? []).map((it, idx) => ({
        invoice_id: inv.id,
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
        source_quote_item_id: it.id,
        position: idx,
      }));
      const { error: iiErr } = await supabaseAdmin.from("invoice_items").insert(rows);
      if (iiErr) throw new Error(`Invoice items failed: ${iiErr.message}`);
    }

    // Mark the quote as invoiced (state machine continues).
    await supabaseAdmin
      .from("quotes")
      .update({ quote_state: "invoiced" })
      .eq("id", q.id);

    return { invoice: inv };
  });

// ---------- Mark invoice paid ----------

export const lifecycleMarkInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      invoice_id: z.string().uuid(),
      amount: z.number().positive(),
      payment_method: z.enum(["cash", "card", "check", "wire", "other"]).default("other"),
      reference_note: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: inv, error: ie } = await supabaseAdmin
      .from("invoices")
      .select("id, total, amount_paid, status")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (ie) throw new Error(ie.message);
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "void") throw new Error("Invoice is void");

    const newPaid = +(Number(inv.amount_paid ?? 0) + data.amount).toFixed(2);
    const total = Number(inv.total ?? 0);
    if (newPaid > total + 0.001) {
      throw new Error(`Payment of ${data.amount} exceeds remaining balance ${total - Number(inv.amount_paid ?? 0)}`);
    }
    const newStatus = newPaid >= total - 0.001 ? "paid" : "partial";

    const { error: upErr } = await supabaseAdmin
      .from("invoices")
      .update({
        amount_paid: newPaid,
        status: newStatus,
        notes: data.reference_note
          ? `${data.payment_method.toUpperCase()} payment: ${data.reference_note}`
          : undefined,
      })
      .eq("id", data.invoice_id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, status: newStatus, amount_paid: newPaid, balance_due: +(total - newPaid).toFixed(2) };
  });

// ---------- Generate paid receipt (gated by trigger) ----------

export const lifecycleGenerateReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      invoice_id: z.string().uuid(),
      payment_method: z.enum(["cash", "card", "check", "wire", "other"]).default("other"),
      reference_note: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: inv, error: ie } = await supabaseAdmin
      .from("invoices")
      .select("id, quote_id, cqh_event_id, total, amount_paid, status, balance_due")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (ie) throw new Error(ie.message);
    if (!inv) throw new Error("Invoice not found");
    if (Number(inv.balance_due ?? 0) !== 0 || inv.status !== "paid") {
      throw new Error(`Invoice is not fully paid (balance ${inv.balance_due}, status ${inv.status})`);
    }

    const { data: receipt, error: rErr } = await supabaseAdmin
      .from("customer_payment_receipts")
      .insert({
        receipt_number: genRef("RCT"),
        invoice_id: inv.id,
        quote_id: inv.quote_id,
        cqh_event_id: inv.cqh_event_id,
        amount: inv.amount_paid,
        payment_method: data.payment_method,
        reference_note: data.reference_note ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (rErr) throw new Error(rErr.message);

    // Reflect terminal state on the quote.
    await supabaseAdmin
      .from("quotes")
      .update({ quote_state: "paid" })
      .eq("id", inv.quote_id);

    return { receipt };
  });

// ---------- Event package: full lifecycle bundle ----------

export const lifecycleEventPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cqh_event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const [{ data: event }, { data: quotes }, { data: invoices }, { data: receipts }] = await Promise.all([
      supabaseAdmin.from("cqh_events").select("*").eq("id", data.cqh_event_id).maybeSingle(),
      supabaseAdmin.from("quotes").select("*, quote_items(*)").eq("cqh_event_id", data.cqh_event_id),
      supabaseAdmin.from("invoices").select("*, invoice_items(*)").eq("cqh_event_id", data.cqh_event_id),
      supabaseAdmin.from("customer_payment_receipts").select("*").eq("cqh_event_id", data.cqh_event_id),
    ]);
    if (!event) throw new Error("Event not found");

    return {
      event,
      quotes: quotes ?? [],
      invoices: invoices ?? [],
      receipts: receipts ?? [],
      generated_at: new Date().toISOString(),
    };
  });
