-- Publish each user's last check-in day so viewers can compute the LIVE streak
-- (a banked streak is stale once its last day slips past yesterday). Mirrors the
-- streak/dream_progress fields already on the public profile projection.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_check_in text;

-- Backfill from the authoritative user_state so live streaks are accurate right
-- away, not only after each user's next app sync.
UPDATE public.profiles p
SET last_check_in = (us.state -> 'profile' ->> 'lastCheckIn')
FROM public.user_state us
WHERE us.user_id = p.id
  AND (us.state -> 'profile' ->> 'lastCheckIn') IS NOT NULL;
