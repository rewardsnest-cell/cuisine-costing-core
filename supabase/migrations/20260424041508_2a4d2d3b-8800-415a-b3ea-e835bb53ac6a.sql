-- Route inventory table: one row per known app route
create table if not exists public.route_inventory (
  route_path text primary key,
  -- Auto reachability check
  last_http_status integer,
  last_http_checked_at timestamptz,
  last_http_error text,
  -- Manual review
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed','reviewed','needs_review','broken')),
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  -- Thumbnail
  thumbnail_url text,
  thumbnail_captured_at timestamptz,
  thumbnail_error text,
  -- Bookkeeping
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.route_inventory enable row level security;

create policy "Admins manage route_inventory"
  on public.route_inventory
  for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Authenticated read route_inventory"
  on public.route_inventory
  for select
  to authenticated
  using (true);

create or replace function public.touch_route_inventory_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_route_inventory_updated_at on public.route_inventory;
create trigger trg_route_inventory_updated_at
  before update on public.route_inventory
  for each row execute function public.touch_route_inventory_updated_at();

-- Public storage bucket for route thumbnails
insert into storage.buckets (id, name, public)
values ('route-thumbnails', 'route-thumbnails', true)
on conflict (id) do nothing;

-- Storage policies (only on storage.objects, not bucket schema)
create policy "Public read route-thumbnails"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'route-thumbnails');

create policy "Admins write route-thumbnails"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'route-thumbnails' and has_role(auth.uid(), 'admin'::app_role));

create policy "Admins update route-thumbnails"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'route-thumbnails' and has_role(auth.uid(), 'admin'::app_role));

create policy "Admins delete route-thumbnails"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'route-thumbnails' and has_role(auth.uid(), 'admin'::app_role));