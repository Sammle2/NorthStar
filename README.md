# Road Map

A personal transformation OS guided by Jarvis. Dreams → goals → daily actions, with streaks,
a 1%-better engine, and an AI guide with arc-reactor energy.

- `fully-alive-mobile/` — the app (React Native / Expo SDK 56; web, iOS, Android)
- `fully-alive/` — Jarvis API server (Express → Claude/Gemini) + the original web v1

## Run

```bash
cd fully-alive && npm install && npm run server   # Jarvis brain on :8787
cd fully-alive-mobile && npm install && npm run web   # app on :8081
```

Add `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` to `fully-alive/.env` to make Jarvis intelligent.
State syncs to Supabase (`rm_state`) — local-first, cloud-backed.
