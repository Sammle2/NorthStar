# NorthStar — Launch Readiness Report

_Audit of the Expo (React Native web + native) app in `fully-alive-mobile/` backed by Supabase project `wsgbnhiklczfiapqrnnf`._

## TL;DR

The app is **closer to a beta than the spec implies** — auth is genuinely production-grade and the social tables already exist with RLS. The **one true launch-blocker (the Anthropic API key shipping in the client) is now fixed** via a server-side proxy. The remaining gaps are **feature gaps vs. the spec** (follow system, notifications, realtime, infinite scroll, normalized goals) — they are not crashes or security holes, and the app is launchable as a beta once the items in **🔴 Critical** are closed.

---

## ✅ Fixed this session

| Area | Change |
|---|---|
| **Exposed API key** | The Anthropic key was compiled into the client bundle (`EXPO_PUBLIC_ANTHROPIC_API_KEY` + `anthropic-dangerous-direct-browser-access`). Replaced with a JWT-protected Supabase Edge Function `claude-proxy` (`supabase/functions/claude-proxy/index.ts`). Client (`src/services/aiService.js`) now calls the proxy with the user's Supabase session token. Key removed from `.env.local`. Token usage capped at 4096 server-side. |
| **Function search_path** | Pinned `search_path = public` on `handle_new_user`, `are_friends`, `is_member`, `get_identities`, `get_or_create_dm`, `search_profiles` (migration `harden_function_search_path`). |
| **`.env.example`** | Created — documents public vs. server-side vars. |
| **Login routing trap** | Onboarded users now go straight to the app on sign-in / cold boot / Welcome CTA (no dream-page dead-end). |
| **Dashboard crash** | Hardened `generateNonNegotiables` against goals missing `dailyActions`. |
| **Post visibility** | Profile projection now saved before posting so a fresh account's post isn't hidden by RLS. |

---

## 🔴 Critical (must close before public launch)

1. **Activate the AI proxy secret (1 command).** The proxy is deployed and the client is wired, but the secret isn't set yet, so AI currently falls back to local templates. Run:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref wsgbnhiklczfiapqrnnf
   ```
   (or Dashboard → Project Settings → Edge Functions → Secrets). Then **rotate the key you pasted in chat** — treat it as compromised.

2. **"Begin Your Journey" silent accounts.** Each tap creates a throwaway `northstar.*@gmail.com` auth user with a fake email (3 already exist). For public launch this pollutes `auth.users`, can't do password reset, and fragments user data across accounts. **Decision needed:** require real email signup, or keep silent accounts but use a device-anonymous provider (`supabase.auth.signInAnonymously()`) instead of fake gmail addresses.

3. **Email verification is effectively off.** New accounts are auto-confirmed by the `handle_new_user` trigger, so email ownership is never verified — open to spam/throwaway abuse. For a real launch, require verification (or anonymous-auth + verify-on-upgrade).

---

## 🟠 High priority

4. **Goals/milestones are not in normalized tables.** They live inside the `user_state` JSON blob (the `goals`/`milestones`/`steps` tables exist but have 0 rows). This blocks the spec's public goal-sharing, "shared goals generate feed content," and querying goals across users. Migrating goals to relational tables is the largest data-model task.

5. **Follow system not implemented.** The app uses a **mutual friends** model (`friendships`), not asymmetric **follows**. Spec wants follow/unfollow, follower/following counts, and a "Following" feed. Needs a `follows` table + service + UI swap.

6. **Realtime not implemented.** Feed, likes, comments, notifications are fetch-on-load. No `supabase.channel(...)` subscriptions anywhere. Needs Realtime wiring per surface.

7. **Notifications not implemented.** No `notifications` table, center, unread count, or mark-as-read.

8. **Leaked-password protection disabled** (Supabase Auth). Enable HaveIBeenPwned check: Dashboard → Auth → Policies.

---

## 🟡 Medium priority

9. **Feed UX gaps:** no infinite scroll, no pull-to-refresh, no skeletons (`src/app/screens/Social.js` loads a single 50-row page). Comments table exists (`post_comments`) but there's **no comments UI** — only likes.
10. **`avatars` storage bucket allows listing** (broad SELECT policy). Tighten to object-read-only.
11. **`SECURITY DEFINER` RPCs callable by anon** (`are_friends`, `is_member`). These are RLS helpers — revoke `anon`/`authenticated` EXECUTE on the RPC endpoints (they still work inside policies).
12. **No CI checks / lint.** Project is plain JS (so "no TypeScript errors" is N/A despite `tsconfig.json`); no ESLint config; no `typecheck`/`lint`/`test` scripts in `package.json`.
13. **No web deploy config.** No `netlify.toml`/`vercel.json`; deploys are manual `expo export -p web` → upload `dist/`.

---

## Ready-for-Launch Checklist

- [ ] **Set `ANTHROPIC_API_KEY` Supabase secret** and rotate the leaked key _(Critical #1)_
- [ ] **Decide signup model** — real email vs. anonymous auth; stop fake-gmail silent accounts _(Critical #2/#3)_
- [ ] Enable leaked-password protection in Supabase Auth _(High #8)_
- [ ] Tighten `avatars` bucket SELECT policy _(Medium #10)_
- [ ] (Feature) Follow system + Following feed _(High #5)_
- [ ] (Feature) Notifications table + center + realtime _(High #6/#7)_
- [ ] (Feature) Migrate goals to normalized tables + public goal sharing _(High #4)_
- [ ] (Feature) Feed: infinite scroll, pull-to-refresh, comments UI _(Medium #9)_
- [ ] Add `netlify.toml` (or Vercel) + run a clean production `expo export -p web` _(Medium #13)_
- [ ] App store: confirm `app.json` bundle id, version, icons, splash, privacy policy URL, and Apple/Google data-safety forms

---

## Deployment

**Backend (Supabase):** already hosted. To ship the AI proxy: `supabase functions deploy claude-proxy` (already deployed via tooling) + set the secret above. Migrations live in the DB; export them with `supabase db pull` to version-control going forward.

**Web (Netlify/Vercel):**
```bash
cd fully-alive-mobile
npx expo export -p web          # outputs dist/
# Netlify: publish dir = dist ; set EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY in site env
```
Add a `netlify.toml` with `[build] command = "npx expo export -p web"` and `publish = "dist"`.

**Native (EAS):** `eas.json` exists. `eas build -p ios` / `-p android`, then submit. Set EXPO_PUBLIC_ vars in the EAS build profile.

---

## What I recommend next

Items #4–#7 (normalized goals, follow system, realtime, notifications) are each a meaningful feature build — together they're the bulk of the spec and shouldn't be one blind pass over a working app. I suggest we do them **one at a time, verified end-to-end**, starting with whichever you value most for launch. Tell me which to build first.
