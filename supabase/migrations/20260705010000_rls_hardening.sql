-- RLS hardening from the 2026-07-05 policy audit.
--
-- Apply via the Supabase dashboard SQL editor: this project's migration history
-- predates the repo, so `supabase db push` won't run it cleanly. Wrapped in a
-- transaction so it's all-or-nothing.

begin;

-- #1 friendships — only the ADDRESSEE may accept/decline a request.
-- Before: either party could UPDATE the status, so a requester could accept
-- their OWN outgoing request and force-friend anyone — which unlocks that
-- person's friends-only profile and posts. Cancelling an outgoing request is
-- still covered by the existing DELETE policy ("remove friendship").
drop policy if exists "respond to friend request" on public.friendships;
create policy "respond to friend request" on public.friendships
  for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

-- #2 post_comments — comments were world-readable (USING true), even on private
-- or friends-only posts. Gate reads by the SAME visibility rule as posts.
-- (Assumes the comment's post reference column is `post_id`.)
drop policy if exists "Post comments are viewable by everyone" on public.post_comments;
drop policy if exists "view gated comments" on public.post_comments; -- idempotent re-run
create policy "view gated comments" on public.post_comments
  for select
  using (
    exists (
      select 1
      from public.posts pp
      join public.profiles pr on pr.id = pp.user_id
      where pp.id = post_comments.post_id
        and (
          pr.visibility = 'public'
          or pr.id = auth.uid()
          or public.are_friends(auth.uid(), pr.id)
        )
    )
  );

-- #4 direct_messages — add a WITH CHECK so a receiver marking a message as read
-- can't also reassign or tamper with the row (previously UPDATE had no check).
drop policy if exists "Receivers can mark DMs as read" on public.direct_messages;
create policy "Receivers can mark DMs as read" on public.direct_messages
  for update
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

commit;
