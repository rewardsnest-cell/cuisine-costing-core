
# VPSFinest Admin Quote — Mega Prompt Implementation

This builds on the existing Customer ↔ Event ↔ Quote ↔ Invoice ↔ Receipt lifecycle (already wired in `/admin/exports`) and adds the missing pieces from the mega-prompt spec:

1. **Structured menu sections** on quote items (Appetizers, Entrées, Sides, Desserts, Beverages, Staffing, Rentals).
2. **Unstructured input ingestion** — paste handwritten notes / email / pasted text and extract a draft quote with Lovable AI (Gemini), never inventing prices.
3. **Branded VPSFinest quote PDF** — premium layout with logo, customer + event details, sectioned menu, pricing summary, assumptions, terms.
4. **DRAFT → SENT → APPROVED → EXPIRED** lifecycle with hard gates (only APPROVED quotes can invoice — already enforced; add SENT + EXPIRED transitions).
5. **Send to Client** — emails the branded PDF to the customer on the linked event and marks quote SENT.

---

## What's already in place (no change needed)

- `cqh_events` carries the customer record (name/email/phone/org/billing/location).
- `quotes.cqh_event_id` + DB triggers prevent orphan quotes.
- `invoices` requires `quote_state = 'approved'` (DB-enforced).
- `customer_payment_receipts` requires `balance_due = 0`.
- `LifecyclePanel` UI lists Events, Quotes, Invoices, Receipts and exposes Approve / Invoice / Mark Paid / Receipt / Package export.

---

## Changes by area

### 1. Database migration

- Add column `quote_items.section text` with values `appetizer | entree | side | dessert | beverage | staffing | rental | other` (default `other`, indexed).
- Extend `quote_state` enum with `draft`, `sent`, `expired`. Keep existing values (`approved`, `invoiced`, `paid`) so the invoice/receipt triggers continue to work unchanged.
- Add `quotes.sent_at timestamptz`, `quotes.expires_at date` (default `created_at + 30 days`), `quotes.sent_to_email text`.
- Add trigger `trg_quote_expire_check` that marks `quote_state = 'expired'` when `expires_at < CURRENT_DATE` and state is still `draft`/`sent` (run on read-time helper view; safer than a cron — done via a SQL function `mark_expired_quotes()` callable by the app).

### 2. Server functions (`src/lib/server-fns/event-lifecycle.functions.ts`)

Add:
- `quoteIngestUnstructured` — input: `{ cqh_event_id, raw_text, source_label? }`. Calls Lovable AI (`google/gemini-2.5-flash`) with a strict system prompt: extract `{ menu: [{section, name, qty, per_guest, price?}], staffing[], rentals[], dietary_notes, missing_fields[] }`. Creates a `quote` in `draft` with `quote_items` carrying the new `section`. Never fills prices that weren't in the input — leaves `unit_price = 0` and adds an entry to `missing_fields`.
- `quoteSetStatus` — transitions `draft → sent → approved → expired`, with guards (cannot un-send, cannot revive expired).
- `quoteSendToClient` — generates the branded PDF (server-side via the same `jspdf` helper), uploads to `site-assets/quotes/`, sends an email to `cqh_events.customer_email` using the existing `lib/email/send.ts`, then sets state to `sent` and stamps `sent_at`/`sent_to_email`.
- `quoteRenderPdfData` — read-only helper returning the structured data the PDF needs (so the client can re-download without re-emailing).

### 3. Branded VPSFinest quote PDF (`src/lib/admin/vpsfinest-quote-pdf.ts` — new)

Reuses `BRAND` and `drawBrandedHeader/Footer` from `src/lib/pdf-brand.ts`. Layout:
- Cover band with VPS Finest logo (`src/assets/vpsfinest-logo.png` per Core memory) + "Catering Proposal" + quote number + date.
- Client & Event block (name, email/phone, event name, date, location, guest count).
- Menu sections rendered as separate `autoTable` blocks in spec order: Appetizers, Entrées, Sides, Desserts, Beverages, Staffing & Service, Rentals & Equipment. Sections with no items are skipped.
- Pricing Summary: subtotal / fees / tax / total. Items with `unit_price = 0` are flagged as **"Estimate pending"** rather than $0.
- Assumptions & Notes (menu subject to availability, guest count confirmation, pricing subject to final approval).
- Terms & Next Steps (deposit, final payment, expiration date from `quotes.expires_at`, approval instructions).

### 4. UI — `src/components/admin/exports/LifecyclePanel.tsx`

- New **"Ingest Notes → Draft Quote"** dialog on each event row (textarea + paste area + optional file upload — text only for now). Submits to `quoteIngestUnstructured`.
- **Quote row actions** widened: `Edit Items` (opens a drawer to edit `quote_items` with a `section` selector), `Download PDF`, `Send to Client`, `Approve`, `Invoice`, `Mark Paid`, `Receipt`. Buttons disable per current `quote_state`.
- Status badge shows `DRAFT / SENT / APPROVED / EXPIRED / INVOICED / PAID` with color.

### 5. Hard guards (per spec)

- Quote row insert without `cqh_event_id` already blocks (existing trigger).
- Server functions reject status transitions that skip stages.
- AI ingest is wrapped to `temperature: 0` and a system prompt that explicitly forbids inventing prices.
- The `Send to Client` button is hidden unless the event has a `customer_email`.

---

## File list

- **Migration**: `supabase/migrations/<ts>_quote_mega_prompt.sql` — enum values, columns, helper function.
- **Created**: `src/lib/admin/vpsfinest-quote-pdf.ts` (branded PDF builder).
- **Edited**: `src/lib/server-fns/event-lifecycle.functions.ts` (new server fns: ingest, set status, send to client, render data).
- **Edited**: `src/components/admin/exports/LifecyclePanel.tsx` (ingest dialog, edit-items drawer, download PDF, send-to-client button, expanded status badges).

---

## Out of scope (future layers, per the spec's "Internal Note")

- OCR of handwritten image uploads — the ingest dialog accepts pasted text only in this iteration. We can add image/PDF upload + OCR in a follow-up that calls `document--parse_document`-style server logic.
- Auto-pricing from recipes / Kroger costing — left to the existing pricing engine; quotes generated from notes start with `unit_price = 0` until an admin fills them.
- CRM sync.
