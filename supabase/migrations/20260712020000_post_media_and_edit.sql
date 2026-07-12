-- Post media (photos/videos) + editing.
-- Adds media columns to posts, an UPDATE (edit) policy for authors, and a public
-- `post-media` storage bucket mirroring the avatars bucket (per-user folder).

-- 1) media columns
alter table public.posts add column if not exists media_url text;
alter table public.posts add column if not exists media_type text;
alter table public.posts drop constraint if exists posts_media_type_check;
alter table public.posts add constraint posts_media_type_check
  check (media_type is null or media_type in ('image', 'video'));

-- 2) let authors EDIT their own posts (posts had only INSERT / DELETE / SELECT)
drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts" on public.posts
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3) storage bucket for post media — public read, like avatars
insert into storage.buckets (id, name, public)
  values ('post-media', 'post-media', true)
  on conflict (id) do nothing;

-- 4) storage policies for post-media (mirror the avatars bucket: per-user folder)
drop policy if exists "post-media public read" on storage.objects;
create policy "post-media public read" on storage.objects
  for select using (bucket_id = 'post-media');

drop policy if exists "post-media owner insert" on storage.objects;
create policy "post-media owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "post-media owner delete" on storage.objects;
create policy "post-media owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "post-media owner update" on storage.objects;
create policy "post-media owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
