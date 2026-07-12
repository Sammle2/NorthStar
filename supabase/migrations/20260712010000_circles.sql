-- Circles — Oura-style groups of people who share their daily stats (streak,
-- whether they hit it today, and % to dream). A user can create and belong to
-- many circles; others join with a short CODE or by accepting an INVITE from a
-- member. Circle-mates can see each other's stats even if they aren't friends —
-- that's the point of a circle — but ONLY via the gated RPCs below, so a member's
-- private data never leaks outside a circle they actually share.

-- Reclaim the `circles` name from an empty, unreferenced early-scaffolding table
-- (schema creator_id/category/city/max_members; 0 rows; 0 code references in the
-- repo either deployment builds from). Safe to drop; this feature owns it now.
drop table if exists public.circle_members cascade;
drop table if exists public.circles cascade;

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  join_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'member' check (status in ('owner','member','invited')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  unique (circle_id, user_id)
);
create index if not exists circle_members_user_idx on public.circle_members(user_id);
create index if not exists circle_members_circle_idx on public.circle_members(circle_id);

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;

-- All real access is through the SECURITY DEFINER RPCs; keep direct table access
-- minimal. A user may read their OWN membership rows (harmless) and nothing else.
drop policy if exists circle_members_select_self on public.circle_members;
create policy circle_members_select_self on public.circle_members for select using (user_id = auth.uid());

-- ── helpers ────────────────────────────────────────────────────────────────
-- Active member (owner/member, not a pending invite). SECURITY DEFINER so RLS on
-- circle_members can call it without recursing.
create or replace function public.is_circle_member(p_circle uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.circle_members m
    where m.circle_id = p_circle and m.user_id = p_user and m.status in ('owner','member')
  );
$$;

-- Short, unambiguous join code, unique across circles.
create or replace function public._gen_circle_code()
returns text language plpgsql set search_path = public as $$
declare alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; code text; i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.circles where join_code = code);
  end loop;
  return code;
end $$;

-- ── write RPCs ─────────────────────────────────────────────────────────────
create or replace function public.create_circle(p_name text)
returns public.circles language plpgsql security definer set search_path = public as $$
declare v_circle public.circles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'A circle needs a name'; end if;
  insert into public.circles (name, join_code, created_by)
    values (left(trim(p_name), 60), public._gen_circle_code(), auth.uid())
    returning * into v_circle;
  insert into public.circle_members (circle_id, user_id, status)
    values (v_circle.id, auth.uid(), 'owner');
  return v_circle;
end $$;

create or replace function public.join_circle(p_code text)
returns public.circles language plpgsql security definer set search_path = public as $$
declare v_circle public.circles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_circle from public.circles where upper(join_code) = upper(trim(p_code));
  if v_circle.id is null then raise exception 'No circle found for that code'; end if;
  insert into public.circle_members (circle_id, user_id, status)
    values (v_circle.id, auth.uid(), 'member')
    on conflict (circle_id, user_id) do update set status = 'member'
      where circle_members.status = 'invited'; -- a pending invite becomes full membership
  return v_circle;
end $$;

create or replace function public.invite_to_circle(p_circle uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_circle_member(p_circle, auth.uid()) then raise exception 'not a member of this circle'; end if;
  insert into public.circle_members (circle_id, user_id, status, invited_by)
    values (p_circle, p_user, 'invited', auth.uid())
    on conflict (circle_id, user_id) do nothing; -- already invited or a member: no-op
end $$;

create or replace function public.respond_invite(p_circle uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update public.circle_members set status = 'member'
      where circle_id = p_circle and user_id = auth.uid() and status = 'invited';
  else
    delete from public.circle_members
      where circle_id = p_circle and user_id = auth.uid() and status = 'invited';
  end if;
end $$;

create or replace function public.leave_circle(p_circle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_was_owner boolean; v_next uuid;
begin
  select (status = 'owner') into v_was_owner
    from public.circle_members where circle_id = p_circle and user_id = auth.uid();
  delete from public.circle_members where circle_id = p_circle and user_id = auth.uid();
  if coalesce(v_was_owner, false) then
    -- hand ownership to the earliest-joined remaining member, or delete an empty circle
    select user_id into v_next from public.circle_members
      where circle_id = p_circle and status in ('owner','member') order by joined_at asc limit 1;
    if v_next is null then
      delete from public.circles where id = p_circle;
    else
      update public.circle_members set status = 'owner' where circle_id = p_circle and user_id = v_next;
    end if;
  end if;
end $$;

-- ── read RPCs ──────────────────────────────────────────────────────────────
create or replace function public.my_circles()
returns table (id uuid, name text, join_code text, member_count bigint, is_owner boolean)
language sql security definer set search_path = public as $$
  select c.id, c.name, c.join_code,
    (select count(*) from public.circle_members m2 where m2.circle_id = c.id and m2.status in ('owner','member')),
    (m.status = 'owner')
  from public.circles c
  join public.circle_members m on m.circle_id = c.id and m.user_id = auth.uid() and m.status in ('owner','member')
  order by c.created_at desc;
$$;

create or replace function public.my_circle_invites()
returns table (circle_id uuid, name text, invited_by_name text, member_count bigint)
language sql security definer set search_path = public as $$
  select c.id, c.name, coalesce(p.full_name, p.username, 'Someone'),
    (select count(*) from public.circle_members m2 where m2.circle_id = c.id and m2.status in ('owner','member'))
  from public.circle_members m
  join public.circles c on c.id = m.circle_id
  left join public.profiles p on p.id = m.invited_by
  where m.user_id = auth.uid() and m.status = 'invited'
  order by m.joined_at desc;
$$;

-- The stats board for one circle. Reads LIVE from each member's user_state (so the
-- numbers are always current, no projection staleness) — but only when the CALLER
-- is an active member of that circle. Returns raw streak + last_check_in; the
-- client derives the live streak + "hit today" in the viewer's local date, matching
-- the rest of the app's client-local streak logic.
create or replace function public.get_circle_members(p_circle uuid)
returns table (user_id uuid, name text, username text, avatar_url text, streak int, last_check_in text, dream_progress int, status text)
language sql security definer set search_path = public as $$
  select
    m.user_id,
    coalesce(us.state->'profile'->>'name', p.full_name),
    coalesce(us.state->'profile'->>'username', p.username),
    coalesce(us.state->'profile'->>'avatarUrl', p.avatar_url),
    coalesce((us.state->'profile'->>'streak')::int, 0),
    us.state->'profile'->>'lastCheckIn',
    coalesce((
      select round(avg(coalesce((g->>'progress')::numeric, 0)))::int
      from jsonb_array_elements(
        case when jsonb_typeof(us.state->'profile'->'goals') = 'array'
          then us.state->'profile'->'goals' else '[]'::jsonb end) g
    ), 0),
    m.status
  from public.circle_members m
  left join public.profiles p on p.id = m.user_id
  left join public.user_state us on us.user_id = m.user_id
  where m.circle_id = p_circle
    and m.status in ('owner','member')
    and public.is_circle_member(p_circle, auth.uid())
  order by (m.status = 'owner') desc, m.joined_at asc;
$$;

grant execute on function public.is_circle_member(uuid, uuid) to authenticated;
grant execute on function public.create_circle(text) to authenticated;
grant execute on function public.join_circle(text) to authenticated;
grant execute on function public.invite_to_circle(uuid, uuid) to authenticated;
grant execute on function public.respond_invite(uuid, boolean) to authenticated;
grant execute on function public.leave_circle(uuid) to authenticated;
grant execute on function public.my_circles() to authenticated;
grant execute on function public.my_circle_invites() to authenticated;
grant execute on function public.get_circle_members(uuid) to authenticated;
