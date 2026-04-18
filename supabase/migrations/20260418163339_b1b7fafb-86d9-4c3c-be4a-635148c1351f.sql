
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do update set public = true;

create policy "Public read recipe photos"
  on storage.objects for select
  using (bucket_id = 'recipe-photos');

create policy "Admins write recipe photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and public.has_role(auth.uid(), 'admin'));

create policy "Admins update recipe photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'recipe-photos' and public.has_role(auth.uid(), 'admin'));

create policy "Admins delete recipe photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and public.has_role(auth.uid(), 'admin'));
