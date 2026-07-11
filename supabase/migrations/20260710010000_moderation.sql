-- User-safety / moderation for App Store UGC compliance (Apple Guideline 1.2):
-- report objectionable posts, and block abusive users so their content is hidden.

-- Reports: a signed-in user flags a post. Write-only from clients; only staff
-- (service role / dashboard) can read and act on them.
create table if not exists public.post_reports (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text not null default 'reported' check (char_length(reason) <= 500),
  created_at  timestamptz not null default now(),
  unique (post_id, reporter_id)
);
alter table public.post_reports enable row level security;
drop policy if exists post_reports_insert_own on public.post_reports;
create policy post_reports_insert_own on public.post_reports
  for insert to authenticated with check (reporter_id = auth.uid());
-- Intentionally no SELECT policy: clients cannot read the reports table.

-- Blocks: the blocker hides the blocked user's content everywhere.
create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- Is there a block in EITHER direction between two users? SECURITY DEFINER so it
-- bypasses the blocks table's own RLS (which restricts each user to rows where
-- they are the blocker) — otherwise the "author blocked viewer" direction would
-- be invisible to the viewer and wouldn't filter. Mirrors public.are_friends.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;
revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, anon, service_role;

-- Defense in depth: hide blocked authors' posts at the DB layer, both directions
-- (you don't see them; they don't see you). Rebuild the posts SELECT policy to
-- add the block check on top of the existing audience rule.
drop policy if exists posts_select_by_audience on public.posts;
create policy posts_select_by_audience on public.posts
  for select to authenticated
  using (
    (
      user_id = auth.uid()
      or audience = 'public'
      or (audience = 'friends' and public.are_friends(auth.uid(), user_id))
    )
    and not public.is_blocked_between(auth.uid(), posts.user_id)
  );
