# NorthStar — Release Checklist

Status as of June 15, 2026. ✅ = done in-app · ⬜ = needs you (account/design/device)

## App configuration (code) — DONE
- ✅ App name set to **NorthStar**, slug `northstar`, deep-link scheme `northstar`
- ✅ `ios.bundleIdentifier` + `android.package` = `app.northstar`
- ✅ `userInterfaceStyle: "dark"` (matches the dark UI; fixes status bar + launch flash)
- ✅ Splash screen configured (`expo-splash-screen`, bg `#07070f`)
- ✅ `eas.json` with development / preview / production build profiles
- ✅ OAuth + password-reset deep links use the `northstar://` scheme

## Auth & data — DONE & verified
- ✅ Email/password auth (Apple/Google wired, native-only)
- ✅ Cloud sync of full profile via `user_state` (RLS-protected), push + pull verified
- ✅ Email-confirmation handling (local-first; sync activates after confirmation)

## Before first build — NEEDS YOU
- ⬜ **Confirm `app.northstar` bundle id** is what you want (permanent after publishing).
- ⬜ **Apple Developer Program** membership ($99/yr) + **Google Play Console** ($25 once).
- ⬜ `eas login` then `eas build:configure` to link/create the EAS project (sets the
      `extra.eas.projectId`). Run `eas build -p ios --profile preview` for a test build.

## Auth providers (Supabase dashboard) — NEEDS YOU
- ⬜ Decide email confirmation stays ON (current). Consider a custom SMTP sender +
      branded confirmation email (default Supabase sender lands in spam more often).
- ⬜ To enable Apple sign-in: add the Apple provider in Supabase + Sign in with Apple
      capability in the Apple dev portal.
- ⬜ To enable Google sign-in: add Google provider + OAuth client IDs; add
      `northstar://oauth/callback` to allowed redirect URLs.
- ⬜ Add `northstar://reset-password` + your site URL to Supabase Auth → URL config.

## Store assets — PARTLY YOU
- ✅ Listing copy drafted → `store/STORE_LISTING.md`
- ✅ Privacy policy drafted → `store/PRIVACY_POLICY.md` (host at https://northstar.app/privacy)
- ⬜ App icon: `assets/icon.png` exists — confirm it's the final 1024×1024 NorthStar mark.
- ⬜ Screenshots: capture on the iOS Simulator at required sizes (6.7" = 1290×2796,
      6.5", plus 12.9" iPad if you keep `supportsTablet`). Web-preview shots aren't
      submission-grade. Suggested screens: Dashboard, Roadmap path, Coach chat, Onboarding.
- ⬜ Stand up https://northstar.app with /privacy and /support pages.

## Pre-submission QA — RECOMMENDED
- ⬜ Test the full flow on a real device build: sign up → confirm email → onboarding →
      dream reveal → daily check-in → sign out → sign in on a second device (verify pull).
- ⬜ Verify offline use: airplane mode → make changes → reconnect → confirm sync.
- ⬜ Remove/clean the verification test account (`sammy.test.20260615@gmail.com`) from
      Supabase auth before launch.

## Known follow-ups (non-blocking)
- The legacy `src/sync.js` + wide-open `rm_state` table are dead code from the prototype —
  safe to delete; the insecure `rm_state_open` RLS policy should be dropped if `rm_state`
  is removed.
- Normalized per-table sync (`src/services/syncService.js`, `supabaseService.js`) is
  superseded by the `user_state` blob sync — candidate for removal to reduce confusion.
