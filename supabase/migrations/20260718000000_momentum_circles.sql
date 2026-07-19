-- ── Momentum roadmap + Circle dream-sharing ──────────────────────────────────
-- Additive layer over the existing circles feature (20260712010000_circles).
-- Nothing here drops or rewrites another author's table; it only ADDS columns,
-- ADDS tables, and backward-compatibly widens two RPCs (old call sites keep
-- working — the new params are defaulted, the new return columns are extra).
--
-- Two orthogonal circle axes (separate fields, NOT hardcoded "types"):
--   comparison_mode : cooperative | competitive   (v1 ships cooperative)
--   trackable_type  : habit | goal                (default framing only)
--
-- Per-member, per-dream visibility lives in circle_dream_shares.share_level.
-- The board RPC reads each sharer's momentum straight out of their synced
-- user_state blob — the SAME mechanism get_circle_members already uses for
-- streak/progress — so momentum never has to be recomputed in SQL.

-- ── A. widen circles with the two axes ───────────────────────────────────────
alter table public.circles add column if not exists comparison_mode text not null default 'cooperative'
  check (comparison_mode in ('cooperative','competitive'));
alter table public.circles add column if not exists trackable_type text not null default 'habit'
  check (trackable_type in ('habit','goal'));

-- Recreate create_circle with the two axes DEFAULTED — circleService still calls
-- it with just p_name and gets a cooperative/habit circle, exactly as before.
drop function if exists public.create_circle(text);
create or replace function public.create_circle(
  p_name text,
  p_comparison_mode text default 'cooperative',
  p_trackable_type text default 'habit'
)
returns public.circles language plpgsql security definer set search_path = public as $$
declare v_circle public.circles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'A circle needs a name'; end if;
  insert into public.circles (name, join_code, created_by, comparison_mode, trackable_type)
    values (
      left(trim(p_name), 60), public._gen_circle_code(), auth.uid(),
      case when p_comparison_mode in ('cooperative','competitive') then p_comparison_mode else 'cooperative' end,
      case when p_trackable_type in ('habit','goal') then p_trackable_type else 'habit' end
    )
    returning * into v_circle;
  insert into public.circle_members (circle_id, user_id, status)
    values (v_circle.id, auth.uid(), 'owner');
  return v_circle;
end $$;

-- Widen my_circles to surface the two axes (extra columns; old readers ignore them).
drop function if exists public.my_circles();
create or replace function public.my_circles()
returns table (id uuid, name text, join_code text, member_count bigint, is_owner boolean, comparison_mode text, trackable_type text)
language sql security definer set search_path = public as $$
  select c.id, c.name, c.join_code,
    (select count(*) from public.circle_members m2 where m2.circle_id = c.id and m2.status in ('owner','member')),
    (m.status = 'owner'),
    c.comparison_mode, c.trackable_type
  from public.circles c
  join public.circle_members m on m.circle_id = c.id and m.user_id = auth.uid() and m.status in ('owner','member')
  order by c.created_at desc;
$$;

-- ── B. per-member, per-dream sharing ─────────────────────────────────────────
-- dream_id is TEXT: it's the client's blob goal id (profile.goals[].id), because
-- the live app stores Dreams in the synced user_state blob, not in a table. Not a
-- FK for that reason. A stale share (dream deleted) simply returns no row.
create table if not exists public.circle_dream_shares (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dream_id text not null,
  share_level text not null default 'dream_and_momentum'
    check (share_level in ('dream_only','dream_and_momentum','full_tasks')),
  created_at timestamptz not null default now(),
  unique (circle_id, user_id, dream_id)
);
create index if not exists cds_circle_idx on public.circle_dream_shares(circle_id);
create index if not exists cds_user_idx on public.circle_dream_shares(user_id);

alter table public.circle_dream_shares enable row level security;
-- All board reads go through get_circle_dreams (SECURITY DEFINER); direct table
-- access is limited to a user's OWN shares, and only into circles they belong to.
drop policy if exists cds_own on public.circle_dream_shares;
create policy cds_own on public.circle_dream_shares for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_circle_member(circle_id, auth.uid()));

create or replace function public.share_dream_to_circle(p_circle uuid, p_dream_id text, p_share_level text default 'dream_and_momentum')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_circle_member(p_circle, auth.uid()) then raise exception 'not a member of this circle'; end if;
  if coalesce(trim(p_dream_id), '') = '' then raise exception 'missing dream'; end if;
  if p_share_level not in ('dream_only','dream_and_momentum','full_tasks') then p_share_level := 'dream_and_momentum'; end if;
  insert into public.circle_dream_shares (circle_id, user_id, dream_id, share_level)
    values (p_circle, auth.uid(), p_dream_id, p_share_level)
    on conflict (circle_id, user_id, dream_id) do update set share_level = excluded.share_level;
end $$;

create or replace function public.unshare_dream_from_circle(p_circle uuid, p_dream_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.circle_dream_shares where circle_id = p_circle and user_id = auth.uid() and dream_id = p_dream_id;
end $$;

-- The caller's own shares in a circle (so the UI can show what they're sharing).
create or replace function public.my_circle_shares(p_circle uuid)
returns table (dream_id text, share_level text)
language sql security definer set search_path = public as $$
  select dream_id, share_level from public.circle_dream_shares
  where circle_id = p_circle and user_id = auth.uid();
$$;

-- The circle's shared-dream board. Reads LIVE from each sharer's user_state blob,
-- honouring share_level: dream_only exposes just the title; dream_and_momentum
-- adds the current stone + momentum %; full_tasks adds the current stone's task
-- titles. Cooperative mode is parallel/no-ranking — the client just lists these.
create or replace function public.get_circle_dreams(p_circle uuid)
returns table (
  user_id uuid, name text, username text, avatar_url text,
  dream_id text, dream_title text, category text, share_level text,
  stone_title text, stone_index int, stone_count int,
  momentum_pct int, outcome_text text, tasks jsonb
)
language sql security definer set search_path = public as $$
  select
    s.user_id,
    coalesce(us.state->'profile'->>'name', p.full_name),
    coalesce(us.state->'profile'->>'username', p.username),
    coalesce(us.state->'profile'->>'avatarUrl', p.avatar_url),
    s.dream_id,
    g.value->>'title',
    g.value->>'category',
    s.share_level,
    case when s.share_level in ('dream_and_momentum','full_tasks') then sn.snap->>'stoneTitle' end,
    case when s.share_level in ('dream_and_momentum','full_tasks') then (sn.snap->>'stoneIndex')::int end,
    case when s.share_level in ('dream_and_momentum','full_tasks') then (sn.snap->>'stoneCount')::int end,
    case when s.share_level in ('dream_and_momentum','full_tasks') then (sn.snap->>'momentumPct')::int end,
    case when s.share_level in ('dream_and_momentum','full_tasks') then sn.snap->>'outcomeText' end,
    case when s.share_level = 'full_tasks' then (
      select jsonb_agg(t->>'title') from jsonb_array_elements(coalesce(cs.cur_stone->'tasks','[]'::jsonb)) t
    ) end
  from public.circle_dream_shares s
  join public.circle_members m on m.circle_id = s.circle_id and m.user_id = s.user_id and m.status in ('owner','member')
  left join public.profiles p on p.id = s.user_id
  left join public.user_state us on us.user_id = s.user_id
  left join lateral (
    select gg.value from jsonb_array_elements(
      case when jsonb_typeof(us.state->'profile'->'goals') = 'array' then us.state->'profile'->'goals' else '[]'::jsonb end
    ) gg where gg.value->>'id' = s.dream_id limit 1
  ) g on true
  left join lateral (select g.value->'r2'->'snapshot' as snap) sn on true
  left join lateral (
    select st.value as cur_stone from jsonb_array_elements(
      case when jsonb_typeof(g.value->'r2'->'stones') = 'array' then g.value->'r2'->'stones' else '[]'::jsonb end
    ) st where st.value->>'status' = 'current' limit 1
  ) cs on true
  where s.circle_id = p_circle
    and public.is_circle_member(p_circle, auth.uid())
    and g.value is not null
  order by s.user_id;
$$;

grant execute on function public.create_circle(text, text, text) to authenticated;
grant execute on function public.my_circles() to authenticated;
grant execute on function public.share_dream_to_circle(uuid, text, text) to authenticated;
grant execute on function public.unshare_dream_from_circle(uuid, text) to authenticated;
grant execute on function public.my_circle_shares(uuid) to authenticated;
grant execute on function public.get_circle_dreams(uuid) to authenticated;

-- ── C. canonical relational schema (spec §1) — NOT YET CLIENT-BACKED ──────────
-- The spec lists these tables as the target data model. The LIVE client currently
-- reads/writes the momentum mechanism inside the synced user_state blob (goal.r2),
-- consistent with how the rest of NorthStar persists. These tables are created,
-- RLS-locked, and left as the forward-looking server-authoritative target for a
-- later migration off the blob. They are safe to keep (empty, owner-scoped) or to
-- drop if a fully server-authoritative model is not wanted yet.
create table if not exists public.dreams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null,            -- one of the app's existing categories — unchanged by this spec
  created_at timestamptz not null default now()
);
create table if not exists public.stones (
  id uuid primary key default gen_random_uuid(),
  dream_id uuid not null references public.dreams(id) on delete cascade,
  order_index int not null default 0,
  title text not null,
  target_metric text, target_value numeric, target_unit text,
  status text not null default 'locked' check (status in ('locked','current','complete')),
  created_at timestamptz not null default now()
);
create table if not exists public.levers (
  id uuid primary key default gen_random_uuid(),
  dream_id uuid not null references public.dreams(id) on delete cascade,
  title text not null,
  weight numeric not null default 1.0,   -- weights sum to 1.0 across a dream's levers
  created_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  stone_id uuid not null references public.stones(id) on delete cascade,
  lever_id uuid references public.levers(id) on delete set null,   -- nullable: ungrouped tasks
  type text not null default 'habit' check (type in ('habit','one_off','schedule')),
  title text not null,
  cadence_days jsonb,                     -- 'daily' or ['mon','wed','fri'] — FIXED days, not banking
  created_at timestamptz not null default now()
);
create table if not exists public.momentum_logs (
  id uuid primary key default gen_random_uuid(),
  stone_id uuid not null references public.stones(id) on delete cascade,
  date date not null,
  completed_tasks int not null default 0,
  planned_tasks int not null default 0,
  unique (stone_id, date)
);
create table if not exists public.outcome_logs (
  id uuid primary key default gen_random_uuid(),
  stone_id uuid not null references public.stones(id) on delete cascade,
  date date not null,
  value numeric not null
);

alter table public.dreams enable row level security;
alter table public.stones enable row level security;
alter table public.levers enable row level security;
alter table public.tasks enable row level security;
alter table public.momentum_logs enable row level security;
alter table public.outcome_logs enable row level security;

-- Owner-only access, walked up to the parent dream's user_id.
drop policy if exists dreams_own on public.dreams;
create policy dreams_own on public.dreams for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists stones_own on public.stones;
create policy stones_own on public.stones for all
  using (exists (select 1 from public.dreams d where d.id = stones.dream_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.dreams d where d.id = stones.dream_id and d.user_id = auth.uid()));

drop policy if exists levers_own on public.levers;
create policy levers_own on public.levers for all
  using (exists (select 1 from public.dreams d where d.id = levers.dream_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.dreams d where d.id = levers.dream_id and d.user_id = auth.uid()));

drop policy if exists tasks_own on public.tasks;
create policy tasks_own on public.tasks for all
  using (exists (select 1 from public.stones s join public.dreams d on d.id = s.dream_id where s.id = tasks.stone_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.stones s join public.dreams d on d.id = s.dream_id where s.id = tasks.stone_id and d.user_id = auth.uid()));

drop policy if exists momentum_logs_own on public.momentum_logs;
create policy momentum_logs_own on public.momentum_logs for all
  using (exists (select 1 from public.stones s join public.dreams d on d.id = s.dream_id where s.id = momentum_logs.stone_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.stones s join public.dreams d on d.id = s.dream_id where s.id = momentum_logs.stone_id and d.user_id = auth.uid()));

drop policy if exists outcome_logs_own on public.outcome_logs;
create policy outcome_logs_own on public.outcome_logs for all
  using (exists (select 1 from public.stones s join public.dreams d on d.id = s.dream_id where s.id = outcome_logs.stone_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.stones s join public.dreams d on d.id = s.dream_id where s.id = outcome_logs.stone_id and d.user_id = auth.uid()));
