-- Enforce username uniqueness server-side (case-insensitive).
-- The client's isUsernameAvailable() is a best-effort early check that fails
-- open on errors and can't see RLS-hidden rows — this index is the real gate.
-- Empty-string usernames (every fresh profile before onboarding) are excluded.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null and username <> '';
