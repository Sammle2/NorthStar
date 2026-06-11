import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import Anthropic from '@anthropic-ai/sdk'

// Load fully-alive/.env first, then fall back to the jarvis root .env
// (which holds GEMINI_API_KEY for the n8n stack).
const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(here, '..', '.env') })
dotenv.config({ path: path.join(here, '..', '..', '.env') })

const app = express()
app.use(express.json({ limit: '2mb' }))

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY)
const hasGemini = Boolean(process.env.GEMINI_API_KEY)
const anthropic = hasAnthropic ? new Anthropic() : null
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const GEMINI_TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']
const GEMINI_IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image']

let geminiNextSlot = 0

const PERSONALITIES = {
  loving:
    'Personality mode: LOVING. Lead with warmth and belief in him. Soften hard truths with care, celebrate generously, never scold.',
  balanced:
    'Personality mode: BALANCED. Calm, direct, one step ahead. Encouragement is earned and specific; one hard question when alignment slips.',
  tough:
    "Personality mode: TOUGH LOVE. No coddling. Name the gap between his stated dream and today's behavior plainly. Respect him enough to be blunt — but never cruel, never shaming.",
}

const BASE_SYSTEM = `You are Jarvis, the AI guide inside "Road Map" — a personal transformation operating system. Your user is becoming their future self through dreams broken into goals, steps, and daily routines, with streaks tracking consistency.

THE PHILOSOPHY (this is the operating doctrine — let it shape everything you say):
The leader chooses a target, decides, and aims. The army executes the leader's plans — but only if they're articulated clearly. Every plan must aim at a real improvement in quality of life: happier, healthier, freer. When the user chooses a goal, your job is to make their subconscious believe it's already in motion — speak about their dreams as inevitable outcomes of kept promises, not wishes. Clarity of articulation is everything: vague goals get sharpened, never accepted.

Your voice: think JARVIS from Iron Man — quick, dry wit, playful confidence, unmistakably warm. An occasional "boss" or "sir" lands well. You're a trusted advisor and witness, not a cold assistant and never a corny one. Reference their actual data — streaks, skipped tasks, mood, dreams — never vague platitudes. A broken streak gets a rebuild plan, not pity ("You broke your writing streak — let's rebuild it"). Keep replies short by default (2-4 sentences); go deeper only when asked to continue. You receive a CONTEXT block each message — ground every reply in it.`

function systemFor(personality) {
  return `${BASE_SYSTEM}\n\n${PERSONALITIES[personality] || PERSONALITIES.balanced}`
}

// ---------- provider chain: Anthropic → Gemini → scripted ----------
async function llm(systemText, messages, maxTokens = 600) {
  if (anthropic) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })
    return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  }
  if (hasGemini) {
    // free tier rate-limits bursts — space calls out globally
    const wait = Math.max(0, geminiNextSlot - Date.now())
    geminiNextSlot = Date.now() + wait + 6500
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    let lastErr
    for (const model of GEMINI_TEXT_MODELS) {
      // and retry once after a longer pause on 429
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 12000))
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: 'POST',
              headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemText }] },
                contents: messages.map((m) => ({
                  role: m.role === 'assistant' ? 'model' : 'user',
                  parts: [{ text: m.content }],
                })),
                generationConfig: {
                maxOutputTokens: maxTokens,
                // 2.5's hidden thinking eats the output budget and truncates replies
                ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
              }),
            },
          )
          if (!res.ok) {
            const body = (await res.text()).slice(0, 200)
            const err = new Error(`${model}: HTTP ${res.status} ${body}`)
            err.status = res.status
            throw err
          }
          const data = await res.json()
          const text = (data.candidates?.[0]?.content?.parts || [])
            .map((p) => p.text || '')
            .join('')
            .trim()
            // the app renders plain text — strip Gemini's markdown emphasis and headers
            .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1')
            .replace(/^#{1,4}\s*/gm, '')
          if (text) return text
          throw new Error(`${model}: empty response`)
        } catch (e) {
          lastErr = e
          if (e.status !== 429) break // non-rate-limit error → try next model, don't retry
        }
      }
      // 429s share the quota family — falling through to another model just doubles the burst
      if (lastErr?.status === 429) break
    }
    throw lastErr
  }
  throw new Error('no provider configured')
}

// ---------- chat / check-ins / proactive lines ----------
app.post('/api/jarvis', async (req, res) => {
  const { messages = [], context = {}, personality = 'balanced' } = req.body || {}
  try {
    const contextBlock = `CONTEXT\n${JSON.stringify(context, null, 2)}`
    const history = messages.slice(-12).map((m, i, arr) => ({
      role: m.role,
      content: i === arr.length - 1 && m.role === 'user' ? `${contextBlock}\n\n${m.text}` : m.text,
    }))
    const reply = await llm(systemFor(personality), history, 500)
    res.json({ reply, source: hasAnthropic ? 'claude' : 'gemini' })
  } catch (err) {
    console.error('jarvis error:', err.message)
    res.json({ reply: localCheckin(context), source: 'local', error: err.message })
  }
})

// ---------- intake: dreams -> detailed narrative + goal/step tree ----------
app.post('/api/intake', async (req, res) => {
  const { answers = [], extra = '', dreams = [], identity = '', vision = '' } = req.body || {}
  try {
    const picture = answers.length
      ? answers.map((a) => `- ${a.question} → ${a.answer}`).join('\n')
      : `${dreams.map((d) => `- ${d}`).join('\n')}\nIdentity: ${identity}\nVision: ${vision}`

    const prompt = `The user just answered the Road Map intake questionnaire about their dream life:

${picture}

In their own words, what else is in the dream life: "${extra || '(nothing added)'}"

Produce JSON only (no markdown fences, no commentary) with exactly this shape:
{
  "narrative": "...",
  "dreams": [
    {
      "title": "short dream title",
      "category": "one of: Business, Relationship, Movement, Spiritual, Creativity, Learning, Lifestyle, Health",
      "goals": [
        { "title": "concrete goal", "steps": [ { "title": "specific actionable step", "routine": true|false } ] }
      ]
    }
  ]
}

The "narrative" is the emotional core of this app: NO MORE THAN 6 SENTENCES, second person, present tense, 3-5 years out. Every sentence must mirror their EXACT answers back at them — the wake time they chose, where they live, the work, the body, the people, the thing they wrote in their own words. It should read so specific to them that it hits like a memory of a morning that hasn't happened yet — vivid, sensory, almost tearful, zero generic filler. End with the most emotionally loaded detail they gave you. No headers, no bullets — six sentences maximum.

Derive 2-4 dreams from their answers (work, body, people/relationships, plus anything from their own words). 1-3 goals per dream, 2-4 steps per goal. Mark a step "routine": true when it should repeat daily/near-daily. Every goal must be articulated with military clarity — a target the user's "army" (their daily routines) can execute without interpretation — and each should trace to a quality-of-life improvement: happier, healthier, freer.`

    const text = await llm(systemFor('balanced'), [{ role: 'user', content: prompt }], 4000)
    const parsed = parseJson(text)
    if (!parsed?.dreams?.length) throw new Error('unparseable intake response')
    res.json({ ...parsed, source: hasAnthropic ? 'claude' : 'gemini' })
  } catch (err) {
    console.error('intake error:', err.message)
    res.json({ ...localIntake(dreams, identity, vision), source: 'local', error: err.message })
  }
})

// ---------- weekly summary + 1% analysis ----------
app.post('/api/weekly', async (req, res) => {
  const { context = {}, personality = 'balanced' } = req.body || {}
  try {
    const prompt = `WEEK DATA\n${JSON.stringify(context, null, 2)}\n\nWrite the weekly summary: 1) Wins (specific), 2) Slips (factual, no shame), 3) Focus for next week (one thing), 4) The 1% analysis — what compounding at this pace means for their dreams, with a concrete pace projection if the data allows. Max 180 words, use short headed sections.`
    const reply = await llm(systemFor(personality), [{ role: 'user', content: prompt }], 600)
    res.json({ reply, source: hasAnthropic ? 'claude' : 'gemini' })
  } catch (err) {
    console.error('weekly error:', err.message)
    res.json({ reply: localWeekly(context), source: 'local', error: err.message })
  }
})

// ---------- dream-life image via Gemini ----------
app.post('/api/dream-image', async (req, res) => {
  const { narrative = '', dreams = [] } = req.body || {}
  if (!hasGemini) return res.status(503).json({ error: 'GEMINI_API_KEY not configured' })

  const prompt = `Cinematic, photorealistic image of one quiet moment from this person's future life: ${dreams.join(
    ', ',
  )}. ${narrative.slice(0, 500)} — golden pre-dawn light, atmospheric, hopeful, premium photography, no text or watermarks.`

  let lastErr
  for (const model of GEMINI_IMAGE_MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        },
      )
      if (!r.ok) throw new Error(`${model}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
      const data = await r.json()
      const img = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data)
      if (!img) throw new Error(`${model}: no image in response`)
      return res.json({
        image: `data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}`,
        source: model,
      })
    } catch (e) {
      lastErr = e
      console.error('dream-image:', e.message)
    }
  }
  res.status(502).json({ error: lastErr?.message || 'image generation failed' })
})

// ---------- helpers ----------
function parseJson(text) {
  const cleaned = text.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

// ---------- local fallbacks (no API key at all) ----------
function localCheckin(ctx) {
  const h = ctx.hour ?? new Date().getHours()
  const streak = ctx.topStreak ?? 0
  const done = ctx.completedToday ?? 0
  if (h < 10)
    return streak > 0
      ? `${streak} days strong. The first task is waiting — win it before the world wakes up.`
      : `Day one energy. Pick the first high-priority task and make it inevitable.`
  if (h < 17)
    return done > 0
      ? `${done} down. Keep the chain moving — what's the next high-priority block?`
      : `The afternoon is still yours. One high-priority task, started in the next ten minutes.`
  return `Evening check: log the day honestly, rate the mood, and let tomorrow start clean.`
}

function localWeekly(ctx) {
  const pct = Math.round((ctx.weekCompletion ?? 0) * 100)
  return `WINS\nYou completed ${pct}% of your high-priority tasks this week.\n\nSLIPS\n${
    ctx.mostSkipped ? `"${ctx.mostSkipped}" was skipped most — look at when it's scheduled.` : 'No major skips logged.'
  }\n\nNEXT WEEK\nProtect the morning block. Everything compounds from there.\n\n1% BETTER\nAt this pace you're banking small wins daily.`
}

function guessCategory(text) {
  const t = text.toLowerCase()
  if (/book|write|writ|creat|art|music|paint/.test(t)) return 'Creativity'
  if (/marri|relationship|wife|husband|fianc|christina|family|friend/.test(t)) return 'Relationship'
  if (/business|practice|client|revenue|scale|career|company|income/.test(t)) return 'Business'
  if (/run|gym|lift|fit|weight|health|body|sleep/.test(t)) return 'Movement'
  if (/faith|god|church|pray|spirit|medit/.test(t)) return 'Spiritual'
  if (/learn|read|study|course|skill/.test(t)) return 'Learning'
  return 'Lifestyle'
}

function localIntake(dreams, identity) {
  const who = identity || 'disciplined, present, generous'
  const first = dreams[0] || 'the dream you named'
  return {
    narrative: `It's 5:45 in the morning, three years from now, and you're awake before the alarm — not because you have to be, but because the person you decided to become (${who}) wakes up like this now. Feet on the floor, water, light, no phone. By six you're moving: the run that used to be a negotiation is just what your body does, and somewhere around the second mile the day arranges itself in your mind. Home, shower, then an hour of inner work — journal open, yesterday examined, today aimed. At 8:30 you sit down to the deep work, and here is what's different: ${first} is no longer a wish. It's a system you run. The work that used to take all of you now takes the best ninety minutes of you, and people you trust carry the rest. Lunch is real food and a walk. The afternoon block closes the loops the morning opened. At five you stop — actually stop — because the evening belongs to the people you love, and you are fully there: phone face-down, eyes up, asking real questions and hearing the answers. By ten the lights are out, and the streak — the one you started the year all of this began — is still alive. Looking back, the future you will say it plainly: none of it took a miracle. It took the next kept promise, every day, until the promises became a person.`,
    dreams: dreams.map((d) => ({
      title: d,
      category: guessCategory(d),
      goals: [
        {
          title: `Daily practice toward: ${d}`,
          steps: [
            { title: `30 focused minutes on "${d}"`, routine: true },
            { title: 'Log one sentence on what moved', routine: true },
          ],
        },
        {
          title: `Define "done" for: ${d}`,
          steps: [{ title: 'Write the 12-month version in one paragraph', routine: false }],
        },
      ],
    })),
  }
}

const PORT = process.env.PORT || 8787
app.listen(PORT, () => {
  console.log(
    `Jarvis server on :${PORT} — providers: Anthropic ${hasAnthropic ? '✓' : '✗'} · Gemini ${hasGemini ? '✓' : '✗'}`,
  )
})
