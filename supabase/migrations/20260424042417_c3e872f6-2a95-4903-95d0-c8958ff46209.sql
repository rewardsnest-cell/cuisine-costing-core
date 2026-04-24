create table public.e2e_audit_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  total_routes integer not null default 0,
  passed integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  duration_ms integer not null default 0,
  notes text,
  results jsonb not null default '[]'::jsonb,
  audit_markdown text
);

alter table public.e2e_audit_runs enable row level security;

create policy "Admins manage e2e audit runs"
on public.e2e_audit_runs
for all
to authenticated
using (has_role(auth.uid(), 'admin'::app_role))
with check (has_role(auth.uid(), 'admin'::app_role));

create index e2e_audit_runs_created_at_idx on public.e2e_audit_runs (created_at desc);