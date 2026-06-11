# Road Map — mobile

Your personal transformation OS, guided by Jarvis. React Native (Expo SDK 56), runs on web, iOS, and Android.

## Run it

```bash
# 1. Jarvis brain (Claude API proxy) — lives in ../fully-alive
cd ../fully-alive && npm run server

# 2. The app (separate terminal)
cd fully-alive-mobile
npm run web        # browser at http://localhost:8081
npm start          # QR code for Expo Go on your phone
```

## Connect Claude

Jarvis works offline with scripted responses. To make him intelligent, add your key to
`../fully-alive/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Restart the server. Check-ins, intake generation, and weekly summaries all upgrade to
Claude Sonnet automatically.

**Running on a phone?** Set your Mac's LAN IP in `src/jarvis.js` (the `HOST` constant).

## What's inside

- **Cinematic opening** → orb ignites, wordmark rises, hands off to the app
- **Intake** — dreams → identity → vision → Jarvis generates your dream-life story and a
  Dream → Goal → Step tree. Accept/decline goals (≥1 per dream required).
- **Dashboard** — no-scroll command center: streak, Jarvis orb, time-aware greeting,
  proactive Jarvis line, "How are you doing?" check-in, top 3 priorities, personality slider
  (Loving / Balanced / Tough)
- **Today** — priority tasks (always stay) + optional tasks; swipe right = complete,
  swipe left = skip; encouraging reframe if the morning slipped
- **1% Better** — compounding score, weekly Jarvis summary, dream-life story + artwork
- **Reflect** — end-of-day mood, notes, private photo proof
- **Streaks** — per accepted goal, instant reset, cinematic celebrations at 7/30/100 days
  and on full-priority days

## Honest notes

- The "dream-life image" is procedural generative art (seeded aurora), not an AI image —
  Claude doesn't generate images. Wire up an image API later and swap `DreamArt`.
- Drag-to-reorder is arrow-based for reliability; push notifications need a device build
  with `expo-notifications`. Both are clean follow-ups.
