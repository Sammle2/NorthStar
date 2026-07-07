-- Per-post audience: 'public' (visible to every signed-in user) or 'friends'
-- (visible only to the author and their ACCEPTED friends). Chosen in the composer
-- at send time. Replaces the old author-profile-visibility gating for posts —
-- profile visibility still governs discovery/profile views, but each post now
-- carries its own audience, enforced server-side by RLS (not just client filters).

alter table public.posts
  add column if not exists audience text not null default 'public';

alter table public.posts drop constraint if exists posts_audience_check;
alter table public.posts
  add constraint posts_audience_check check (audience in ('public', 'friends'));

create index if not exists posts_audience_created_idx
  on public.posts (audience, created_at desc);

-- Replace ALL existing SELECT policies on posts with the audience rule.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'posts' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.posts', pol.policyname);
  end loop;
end $$;

create policy posts_select_by_audience on public.posts
  for select to authenticated
  using (
    user_id = auth.uid()
    or audience = 'public'
    or (audience = 'friends' and public.are_friends(auth.uid(), user_id))
  );
