-- Per-user rate limiting for the AI edge-function proxies (claude-proxy,
-- openai-image-proxy). The table is written ONLY by the SECURITY DEFINER function
-- below, invoked from the edge functions with the service role. RLS is enabled
-- with NO policies, so no client (anon or authenticated) can read or write it.

create table if not exists public.ai_usage (
  user_id uuid        not null,
  hour    timestamptz not null,
  count   integer     not null default 0,
  primary key (user_id, hour)
);

alter table public.ai_usage enable row level security;
-- Intentionally no policies: clients get zero access; only service_role reaches it.

-- Atomically increment this user's counter for the current hour and return
-- whether they are still within the allowed number of calls. SECURITY DEFINER so
-- it runs regardless of RLS; search_path pinned to avoid hijacking.
create or replace function public.bump_ai_usage(uid uuid, max_per_hour integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur integer;
begin
  insert into public.ai_usage (user_id, hour, count)
  values (uid, date_trunc('hour', now()), 1)
  on conflict (user_id, hour)
    do update set count = public.ai_usage.count + 1
  returning count into cur;

  return cur <= max_per_hour;
end;
$$;

-- Only the service role (used inside the edge functions) may call it.
revoke all on function public.bump_ai_usage(uuid, integer) from public;
revoke all on function public.bump_ai_usage(uuid, integer) from anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, integer) to service_role;

-- Optional housekeeping: drop counters older than 2 days. Safe to run anytime;
-- schedule via pg_cron if you want it automatic.
-- delete from public.ai_usage where hour < now() - interval '2 days';
