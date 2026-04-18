// Static project audit content. Update when major architecture changes.
// Used by /admin/exports to generate downloadable Markdown + PDF reports.

export const PROJECT_AUDIT_MD = `# Project Audit — VP Finest (Cuisine Costing Core)

_Generated: ${new Date().toISOString().split("T")[0]}_

## 1. PROJECT OVERVIEW

**Name:** VP Finest — vpfinest.com (codebase: tanstack_start_ts)
**Purpose:** End-to-end catering operations platform: quote builder (basic + AI), event management, employee scheduling/timeclock, recipe & inventory costing, receipt/PO/sale-flyer ingestion with OCR, and price-trend analytics.

| Layer | Tech |
|---|---|
| Framework | TanStack Start v1 (React 19, Vite 7, SSR on Cloudflare Workers) |
| Routing | TanStack Router (file-based, \`src/routes/\`) |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix primitives) |
| Backend | Lovable Cloud (Postgres + Auth + Storage + Edge Functions) |
| AI | Lovable AI Gateway (Gemini 2.5 Flash + Gemini 3 Flash preview) |
| Data viz | Recharts, custom SVG sparklines |
| PDF | jspdf + jspdf-autotable + pdfjs-dist |
| State/data | @tanstack/react-query, react-hook-form + zod |

**Hosting:** Cloudflare Workers. Domains: vpfinest.com, www.vpfinest.com.

## 2. DATA MODEL

### Tables (public schema)
- profiles, user_roles, app_settings, admin_requests
- employee_profiles, employee_invites
- suppliers, inventory_items, inventory_adjustments, price_history
- recipes, recipe_ingredients
- quotes, quote_items, event_assignments, event_prep_tasks, event_time_entries
- purchase_orders, purchase_order_items, receipts
- sale_flyers, sale_flyer_items, sale_flyer_pages
- role_section_permissions, user_section_overrides, access_audit_log

### Enums
- \`app_role\`: admin | moderator | user | employee

### Database functions
- update_updated_at_column() — generic timestamp trigger
- has_role(_user_id, _role) — SECURITY DEFINER role check
- is_assigned_to_quote(_quote_id, _user_id) — RLS helper
- apply_po_to_inventory(_po_id) — Receive PO → update stock + log price_history
- handle_new_user() — Trigger on auth.users insert → create profile
- generate_quote_reference() — Auto-assign TQ-XXXXXX
- enforce_quote_revision_lock() — Blocks edits past revision_lock_days
- enforce_time_entry_approval_immutable() — Lock approved time entries
- create_prep_task_for_quote_item() — Auto-create prep tasks

### Storage buckets
- \`receipts\` (public) — scanned receipt images
- \`sale-flyers\` (public) — flyer images / PDF page renders

### Client persistent state
- localStorage.guest_quote_ids — guest's submitted quote IDs
- sessionStorage.quote_handoff — selections handoff between Basic ↔ AI builders
- sessionStorage.quote_handoff_transcript — AI chat transcript
- sessionStorage.quote_handoff_jump_review — jump-to-review flag

## 3. SCREENS / PAGES

### Public
| Path | Purpose |
|---|---|
| / | Marketing homepage |
| /quote | Basic quote builder (wizard) |
| /quote/ai | Advanced AI quote builder |
| /lookup | Look up quote by reference / email |
| /event/$reference | Public event detail by reference |
| /login, /signup | Auth |
| /forgot-password, /reset-password | Password reset |

### Auth-gated
| Path | Purpose |
|---|---|
| /dashboard | User home, sections gated by useSectionAccess |
| /my-quotes | User's quotes |
| /my-events | User's upcoming events |

### Employee-gated
| Path | Purpose |
|---|---|
| /employee | Staff workspace: TimeClock, PrepChecklist, ShoppingList |

### Admin-gated
| Path | Purpose |
|---|---|
| /admin | KPI dashboard |
| /admin/quotes | Quote management + assign staff |
| /admin/events | Confirmed events |
| /admin/inventory | Stock + price sparklines |
| /admin/recipes | Recipe CRUD + cost calc |
| /admin/suppliers | Vendor CRUD + sale flyers dialog |
| /admin/purchase-orders | PO creation + AI scan |
| /admin/receipts | Receipt scan + cost update |
| /admin/sales | All active sale items |
| /admin/trends | Price trend dashboard |
| /admin/employees | Employee profile mgmt |
| /admin/schedule | Event-staff calendar |
| /admin/timesheet | Time entry approvals |
| /admin/users | User list + role mgmt |
| /admin/access | Section permission matrix + invites |
| /admin/exports | This page — audit + CSV exports |

## 4. API ROUTES & SERVER ACTIONS

### Edge Functions (supabase/functions/)
| Function | Model | Purpose |
|---|---|---|
| process-receipt | google/gemini-2.5-flash | OCR receipt → extract line items |
| process-purchase-order | google/gemini-2.5-flash | Parse PO from image |
| process-sale-flyer | google/gemini-2.5-flash | Multi-page flyer extract |
| update-inventory-costs | — | Apply receipt costs → update inventory + price_history |
| quote-assistant | google/gemini-3-flash-preview | Streaming chat for AI quote builder |

### TanStack Server Functions (src/lib/admin/access-control.functions.ts)
inviteEmployee, resendInvite, revokeInvite, setUserRole, setRolePermission, setUserOverride

### DB triggers
- purchase_orders status → 'received' fires apply_po_to_inventory
- on auth.users insert → handle_new_user creates profile
- on quotes update → enforce_quote_revision_lock

## 5. AI / LLM WORKFLOWS

| File | Model | Purpose | Tool |
|---|---|---|---|
| process-receipt/index.ts | gemini-2.5-flash | Extract line items from receipt | extract_receipt_items |
| process-purchase-order/index.ts | gemini-2.5-flash | Parse PO from image | extract_po_items |
| process-sale-flyer/index.ts | gemini-2.5-flash | Multi-page flyer extract | extract_sale_items |
| quote-assistant/index.ts | gemini-3-flash-preview | Conversational quote builder | update_quote_draft (SSE streaming) |

No vector store / RAG.

## 6. KPIs, METRICS & REPORTING

| Metric | Where | Source |
|---|---|---|
| Quote count, revenue, avg ticket | /admin | aggregate of quotes |
| Inventory low-stock count | /admin, /admin/inventory | current_stock < par_level |
| Recipe cost per serving | /admin/recipes | Σ(ingredient.qty × inventory.avg_cost) / servings |
| Quote theoretical vs actual cost | /admin/quotes | quotes.theoretical_cost vs actual_cost |
| Price sparkline (30d) | /admin/inventory + /admin/trends | last 30 rows of price_history |
| Price % change | /admin/trends | (latest - first) / first × 100 |
| Active sales count | /admin/sales | sale_flyer_items joined to active flyers |
| Employee hours | /admin/timesheet | event_time_entries clock_out − clock_in |

## 7. AUTH & ACCESS CONTROL

- Provider: Email/password (Supabase Auth). No OAuth configured.
- Roles enum app_role; user_roles table separate from profiles.
- has_role() SECURITY DEFINER function used in all RLS checks.
- Client hooks: useAuth (user, isAdmin, isEmployee), useSectionAccess (section visibility).
- Server: requireSupabaseAuth middleware validates Bearer token; admin actions re-check via ensureAdmin().

## 8. ENVIRONMENT & SECRETS

| Name | Required |
|---|---|
| VITE_SUPABASE_URL | ✅ |
| VITE_SUPABASE_PUBLISHABLE_KEY | ✅ |
| VITE_SUPABASE_PROJECT_ID | ✅ |
| SUPABASE_URL | ✅ |
| SUPABASE_PUBLISHABLE_KEY | ✅ |
| SUPABASE_SERVICE_ROLE_KEY | ✅ |
| LOVABLE_API_KEY | ✅ (managed) |
| SITE_URL / VITE_SITE_URL | optional |

## 9. KNOWN GAPS / TODOs

- No automated email notifications for quote submission, event reminders, or low-stock.
- No tests configured.
- Edge functions for receipt/PO processing rely on RLS via anon client (no auth middleware).
- File src/lib/admin/access-control.functions.ts is 295 lines — flagged for refactor.
`;

export function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headerSet = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) headerSet.add(k);
  }
  const headers: string[] = Array.from(headerSet);
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  return lines.join("\n");
}

export function downloadFile(content: string | Blob, filename: string, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
