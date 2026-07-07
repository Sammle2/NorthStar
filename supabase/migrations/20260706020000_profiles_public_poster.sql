-- Public-feed authorship: the feed queries join posts → profiles with !inner, so a
-- post is only visible when its AUTHOR's profile row passes profiles RLS. Private
-- profiles are readable only by self/friends — which silently hid every public
-- post by a default-private (fresh) account from the Public feed.
--
-- Fix: posting publicly consents to being identifiable. Additive policy — a
-- profile row is readable by any signed-in user IF that user has at least one
-- public post. Policies OR together, so nothing existing is loosened or replaced.
drop policy if exists profiles_visible_via_public_posts on public.profiles;
create policy profiles_visible_via_public_posts on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.user_id = profiles.id and p.audience = 'public'
    )
  );
