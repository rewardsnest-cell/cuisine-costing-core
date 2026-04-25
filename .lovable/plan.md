## Sales Hub — Daily Operations Admin Area

A new top-level admin nav group called **Sales Hub** containing 9 focused pages. Scripts are read-only/locked content. Prospects, contact log, checklist runs, reviews, referrals, and weekly reviews are stored in the database so the owner (and later staff) have one source of truth.

### New admin pages (under `/admin/sales-hub/...`)

1. **`/admin/sales-hub`** — Dashboard Overview
   - Today's priorities (auto-pulled from outstanding follow-ups + today's checklist progress)
   - Weekly goals snapshot (calls/emails/walk-ins this week vs target)
   - Quick-action tiles: Make calls · Send follow-ups · Ask for reviews · Log activity
   - "Pinned" Daily Checklist preview at the top

2. **`/admin/sales-hub/prospects`** — Local Prospect Lists
   - Editable table grouped by **City** (Aurora · Solon · Hudson) and **Type** (Venue · Corporate · Medical)
   - Columns: Business Name, City, Type, Contact Name, Phone, Email, Notes, Last Contacted, Next Follow-Up, Status
   - Inline add/edit/delete, filter by city/type/status, search by name
   - "Log contact" button per row → writes to contact log + bumps `last_contacted`

3. **`/admin/sales-hub/scripts`** — Sales Scripts (locked content)
   - 6 collapsible script blocks (read-only, copy button on each):
     A) Phone — First Contact · B) Phone — Follow-Up · C) Walk-In
     D) Corporate Email · E) Medical Office Email · F) Venue Partnership Email
   - Locked text rendered from a constant file so it can't be accidentally edited

4. **`/admin/sales-hub/daily`** — Daily Sales Checklist
   - Checkbox list (5 calls / 5 emails / 2 walk-ins / leads logged / follow-ups scheduled / one opportunity moved forward)
   - Persists per-day per-user; resets each day; shows current streak
   - "Log a contact" quick form (prospect dropdown + outcome) feeds the contact log

5. **`/admin/sales-hub/events`** — Event Execution Checklist
   - Three sections: Pre-Event · Day-Of · Post-Event with the listed items
   - Linked to an existing quote/event (dropdown of upcoming events)
   - Saves completion state per event

6. **`/admin/sales-hub/reviews`** — Google Reviews System
   - Editable Google review link field (`{{GOOGLE REVIEW LINK}}`) saved in `app_kv`
   - 3 locked ask scripts (in-person, text, email) with copy + auto-insert link
   - Rules card (ask only happy clients · within 24h · respond to every review)
   - Review-ask log: who was asked, when, channel, did they leave a review

7. **`/admin/sales-hub/follow-ups`** — Follow-Up System
   - Auto-generated follow-up queue (Day 1 / Day 5 / Day 14) based on prospect `last_contacted`
   - Status pipeline: New · Contacted · Interested · Booked · Repeat · Archived
   - Locked follow-up email template with copy button

8. **`/admin/sales-hub/referrals`** — Referral System
   - Trigger panel: pulls recent 5-star review-ask wins
   - Locked referral ask script
   - Referral log: referrer, referred contact, date, status, follow-up notes

9. **`/admin/sales-hub/weekly-review`** — Weekly Review
   - Weekly checklist (25+ outreach actions, new bookings, reviews gained, best review, one improvement, next week planned)
   - Auto-counts from contact log + reviews/bookings tables for the current ISO week
   - Saves a weekly review record with the owner's notes

### Data model (one migration)

New tables (all admin-only via `has_role(auth.uid(), 'admin')`):

- `sales_prospects` — id, business_name, city, type, contact_name, phone, email, notes, status, last_contacted, next_follow_up, created_at, updated_at
- `sales_contact_log` — id, prospect_id (fk), channel (call/email/walk-in/text), outcome, notes, contacted_at, contacted_by
- `sales_daily_checklist` — id, user_id, day (date), calls_done bool, emails_done bool, walkins_done bool, leads_logged bool, followups_scheduled bool, opportunity_moved bool, unique(user_id, day)
- `sales_event_checklist` — id, quote_id (fk), pre_menu, pre_dietary, pre_staffing, pre_equipment, day_arrival, day_setup, day_checkin, day_breakdown, post_thanks, post_invoice, post_review (all bool)
- `sales_review_asks` — id, client_name, channel, asked_at, asked_by, review_received bool, notes
- `sales_referrals` — id, referrer_name, referred_name, referred_contact, asked_at, status, notes
- `sales_weekly_reviews` — id, week_start (date), outreach_count_target, bookings_added, reviews_gained, best_review_text, improvement_note, next_week_plan, completed bool, user_id

`app_kv` reused for `google_review_link`.

### Sidebar registration

Add a new **Sales Hub** group in `NAV_GROUPS` (in `src/routes/admin.tsx`) with the 9 items, each gated by a new `feature_visibility` key (`admin_sales_hub`, `admin_sales_prospects`, `admin_sales_scripts`, `admin_sales_daily`, `admin_sales_events_checklist`, `admin_sales_reviews`, `admin_sales_followups`, `admin_sales_referrals`, `admin_sales_weekly_review`). Migration seeds them all as `phase=public, nav_enabled=true`.

### Files to create

- `src/lib/sales-hub/scripts.ts` — locked script constants (single source of truth)
- `src/routes/admin/sales-hub.tsx` — layout + dashboard
- `src/routes/admin/sales-hub.prospects.tsx`
- `src/routes/admin/sales-hub.scripts.tsx`
- `src/routes/admin/sales-hub.daily.tsx`
- `src/routes/admin/sales-hub.events.tsx`
- `src/routes/admin/sales-hub.reviews.tsx`
- `src/routes/admin/sales-hub.follow-ups.tsx`
- `src/routes/admin/sales-hub.referrals.tsx`
- `src/routes/admin/sales-hub.weekly-review.tsx`
- `supabase/migrations/<ts>_sales_hub.sql` — tables + RLS + feature_visibility seeds

### Files to edit

- `src/routes/admin.tsx` — add Sales Hub nav group

### Style / tone

- Calm, minimal, structured. Cards + tables only. No marketing fluff.
- Scripts displayed in monospaced/serif blocks with a single Copy button — no inline edit controls (locked).
- Prospect tables and logs are fully editable inline.

### What you'll get

- A pinned Daily Checklist + Dashboard accessible from one nav group
- Editable prospect lists grouped by Aurora / Solon / Hudson and by Venue / Corporate / Medical
- Six copy-paste-ready scripts that staff can't accidentally overwrite
- A working follow-up queue derived from your prospect data
- Review and referral logs with locked ask scripts
- A weekly review page that auto-tallies outreach from your contact log

Approve to proceed and I'll build it.