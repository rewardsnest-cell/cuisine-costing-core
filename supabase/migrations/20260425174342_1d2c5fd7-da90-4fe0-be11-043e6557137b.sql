create table if not exists public.pricing_v2_kroger_catalog_raw (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.pricing_v2_runs(run_id) on delete set null,
  store_id text not null,
  kroger_product_id text not null,
  upc text,
  name text not null,
  brand text,
  size_raw text,
  payload_json jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);
create index if not exists idx_pv2_raw_run on public.pricing_v2_kroger_catalog_raw(run_id);
create index if not exists idx_pv2_raw_product on public.pricing_v2_kroger_catalog_raw(store_id, kroger_product_id);

create table if not exists public.pricing_v2_item_catalog (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  product_key text not null unique,
  kroger_product_id text not null,
  upc text,
  name text not null,
  brand text,
  size_raw text,
  net_weight_grams numeric,
  weight_source text not null default 'unknown',
  manual_net_weight_grams numeric,
  manual_override_reason text,
  last_run_id uuid references public.pricing_v2_runs(run_id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_pv2_catalog_store on public.pricing_v2_item_catalog(store_id);
create index if not exists idx_pv2_catalog_kroger on public.pricing_v2_item_catalog(kroger_product_id);

create table if not exists public.pricing_v2_weight_parse_rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  unit text not null,
  multiplier numeric not null default 1,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.pricing_v2_kroger_catalog_raw enable row level security;
alter table public.pricing_v2_item_catalog       enable row level security;
alter table public.pricing_v2_weight_parse_rules enable row level security;

drop policy if exists "Admins manage pv2 raw"     on public.pricing_v2_kroger_catalog_raw;
drop policy if exists "Admins manage pv2 catalog" on public.pricing_v2_item_catalog;
drop policy if exists "Admins manage pv2 rules"   on public.pricing_v2_weight_parse_rules;

create policy "Admins manage pv2 raw"
  on public.pricing_v2_kroger_catalog_raw
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins manage pv2 catalog"
  on public.pricing_v2_item_catalog
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins manage pv2 rules"
  on public.pricing_v2_weight_parse_rules
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_pv2_catalog_updated on public.pricing_v2_item_catalog;
create trigger trg_pv2_catalog_updated
  before update on public.pricing_v2_item_catalog
  for each row execute function public.update_updated_at_column();