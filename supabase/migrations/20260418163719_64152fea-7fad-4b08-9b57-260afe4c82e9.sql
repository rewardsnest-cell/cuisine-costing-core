
-- Create the site-assets bucket (public read)
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

-- Storage policies
create policy "Public can read site-assets"
  on storage.objects for select
  using (bucket_id = 'site-assets');

create policy "Admins can insert site-assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can update site-assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'site-assets' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete site-assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'site-assets' and public.has_role(auth.uid(), 'admin'));

-- Manifest table
create table public.site_asset_manifest (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null default 'other',
  source_url text,
  storage_path text not null,
  public_url text not null,
  alt text,
  width integer,
  height integer,
  bytes integer,
  content_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_asset_manifest enable row level security;

create policy "Anyone can view site asset manifest"
  on public.site_asset_manifest for select using (true);

create policy "Admins manage site asset manifest"
  on public.site_asset_manifest for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger trg_site_asset_manifest_updated
  before update on public.site_asset_manifest
  for each row execute function public.update_updated_at_column();
