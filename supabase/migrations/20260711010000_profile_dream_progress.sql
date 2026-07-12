-- Publish a "dream progress" percentage on the PUBLIC profile projection so
-- friends / viewers can see how far someone is toward their dream, WITHOUT
-- exposing any goal specifics (the goal title is no longer published or shown).
--
-- Additive + backward compatible: older clients simply ignore the column, and it
-- defaults to 0. Paired with the app change that (a) stops writing / showing the
-- goal title on profiles and (b) starts publishing this number.
alter table public.profiles
  add column if not exists dream_progress smallint not null default 0;

-- One-time privacy scrub: clear any goal titles that were previously published to
-- the public projection. Our client no longer writes current_goal, so for our
-- users it stays null from here on. The column is KEPT (not dropped) so any client
-- version still selecting it doesn't error — it just reads as null now.
update public.profiles set current_goal = null where current_goal is not null;
