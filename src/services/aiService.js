// Claude AI Service
// Calls Claude through the `claude-proxy` Supabase Edge Function — the Anthropic
// API key lives ONLY on the server, never in the app bundle. Requests are
// authenticated with the signed-in user's Supabase JWT.
import { getSession } from './supabaseAuth'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseAuth'
import { buildGoal } from '../app/aiEngine'

const CLAUDE_PROXY_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`
const CLAUDE_MODEL = 'claude-sonnet-4-6'

// Rate limiting: space API calls 6.5s apart to avoid 429s
let lastApiCall = 0
const MIN_CALL_INTERVAL = 6500

async function callClaude(prompt, maxTokens = 1024, retries = 3) {
  // Rate limiting
  const now = Date.now()
  const timeSinceLastCall = now - lastApiCall
  if (timeSinceLastCall < MIN_CALL_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_CALL_INTERVAL - timeSinceLastCall))
  }
  lastApiCall = Date.now()

  const session = await getSession()
  const token = session?.access_token
  if (!token) {
    throw new Error('Not signed in — cannot reach the AI service.')
  }

  let lastError = null

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(CLAUDE_PROXY_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          prompt,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Claude API error:', errorText)

        if (response.status === 401) {
          throw new Error('Invalid Claude API key. Check Settings.')
        } else if (response.status === 429) {
          if (attempt < retries - 1) {
            const waitTime = Math.pow(2, attempt) * 5000 // exponential backoff
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          }
          throw new Error('Claude API rate limited. Try again in a few minutes.')
        } else if (response.status === 500) {
          if (attempt < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000))
            continue
          }
          throw new Error('Claude service temporarily unavailable. Try again later.')
        }

        throw new Error(`Claude API error: ${response.status}`)
      }

      const data = await response.json()
      if (!data.content || !data.content[0]) {
        throw new Error('Invalid response from Claude API')
      }

      const content = data.content[0]
      return content.type === 'text' ? content.text : ''
    } catch (error) {
      lastError = error

      if (error.message.includes('API key') || error.message.includes('401')) {
        throw error // Don't retry auth errors
      }

      if (attempt < retries - 1) {
        console.warn(`Claude call attempt ${attempt + 1} failed, retrying...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }

  console.error('Claude API call failed after retries:', lastError)
  throw lastError || new Error('Claude API call failed')
}

// Reusable proxy-backed Claude call for other services (e.g. roadmap validation).
// No API key needed — goes through the authenticated claude-proxy edge function.
export async function runClaude(prompt, maxTokens = 1024) {
  return callClaude(prompt, maxTokens)
}

// Generate goal suggestions based on dream context
export async function suggestGoalsFromDream(dreamDescription, numberOfSuggestions = 3) {
  const prompt = `Based on this dream/vision: "${dreamDescription}"

Generate ${numberOfSuggestions} specific, actionable goals that would help achieve this dream. Format your response as a JSON array where each goal has:
- title: Short, clear goal title
- category: One of: career, health, wealth, relationships, creative, travel, mindset, lifestyle
- description: 1-2 sentences explaining how this goal supports the dream

Return ONLY the JSON array, no other text.`

  try {
    const response = await callClaude(prompt)
    const goals = extractJson(response)

    if (!Array.isArray(goals) || goals.length === 0) {
      throw new Error('Invalid goals format')
    }

    return goals
  } catch (error) {
    console.error('Failed to generate goal suggestions:', error?.message)
    throw new Error(error?.message || 'Could not generate goal suggestions. Try again.')
  }
}

// Generate milestone suggestions for a goal
export async function suggestMilestonesForGoal(goalTitle, goalDescription, theme = '') {
  const prompt = `For the goal: "${goalTitle}"
Description: ${goalDescription}
Theme/Category: ${theme}

Generate 3 milestones for the next 3, 6, and 12 months. For each milestone, provide:
- title: Specific milestone for that timeframe
- horizon: Either "3 months", "6 months", or "12 months"
- description: What success looks like for this milestone

Format as JSON array with objects containing title, horizon, and description. Return ONLY the JSON, no other text.`

  try {
    const response = await callClaude(prompt, 1500)
    const milestones = extractJson(response)

    if (!Array.isArray(milestones) || milestones.length === 0) {
      throw new Error('Invalid milestones format')
    }

    return milestones
  } catch (error) {
    console.error('Failed to generate milestone suggestions:', error?.message)
    throw new Error(error?.message || 'Could not generate milestones. Try again.')
  }
}

// Generate stepping stones for a milestone
export async function suggestStepsForMilestone(milestoneTitle, goalTitle, horizon) {
  const prompt = `For the milestone: "${milestoneTitle}"
As part of goal: "${goalTitle}"
Timeframe: ${horizon}

Generate 3-4 specific, actionable stepping stones (sub-tasks) to achieve this milestone. Each should be completable within a few days to a week.

Format as a JSON array of objects with:
- title: Clear action step
- description: Why it matters

Return ONLY the JSON array, no other text.`

  try {
    const response = await callClaude(prompt)
    const steps = extractJson(response)

    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error('Invalid steps format')
    }

    return steps
  } catch (error) {
    console.error('Failed to generate stepping stones:', error?.message)
    throw new Error(error?.message || 'Could not generate stepping stones. Try again.')
  }
}

// Generate daily actions from a milestone
export async function generateDailyActionsForMilestone(
  milestoneTitle,
  goalTitle,
  numberOfDays = 7,
  coachTone = 'default'
) {
  const toneDescriptions = {
    tough: 'Direct, no-nonsense, demanding but supportive',
    default: 'Balanced, encouraging, practical',
    gentle: 'Warm, supportive, patient, understanding',
  }

  const prompt = `Create ${numberOfDays} daily actions to work toward this milestone:
Milestone: "${milestoneTitle}"
Goal: "${goalTitle}"
Coach tone: ${toneDescriptions[coachTone] || toneDescriptions.default}

Each action should be:
- Specific and completable in 30-60 minutes
- Building progressively toward the milestone
- Realistic and achievable for most people

Format as JSON array where each object has:
- title: The daily action
- description: Why this action matters

Start with easier actions and gradually increase difficulty. Return ONLY the JSON array.`

  try {
    const response = await callClaude(prompt, 2000)
    const actions = extractJson(response)

    if (!Array.isArray(actions) || actions.length === 0) {
      throw new Error('Invalid actions format')
    }

    return actions
  } catch (error) {
    console.error('Failed to generate daily actions:', error?.message)
    throw new Error(error?.message || 'Could not generate daily actions. Try again.')
  }
}

const TONE_DESCRIPTIONS = {
  tough: 'Direct, no-nonsense, demanding but caring — high expectations, zero fluff.',
  default: 'Balanced, honest, encouraging, and practical.',
  gentle: 'Warm, supportive, patient, and understanding.',
}

// Personalized "dream life" reading — a cinematic, second-person narrative of the
// future the user is building, grounded in THEIR own stated dream/goal.
export async function generateDreamLifeStory({ name, goal, goalTitle, extra, tone = 'default' }) {
  const firstName = (name || '').split(' ')[0] || 'friend'
  const dream = [goal, extra].filter((s) => s && s.trim()).join(' — ')
  const prompt = `You are ${firstName}'s personal life coach. Write a vivid, emotional "dream life" reading addressed directly to ${firstName} as "you".

Base it entirely on the dream THEY described — do not invent a generic dream:
Their stated goal/dream: "${dream || goalTitle || goal}"

Describe, in cinematic present tense, what their life looks and feels like once this dream is real — specific to this exact dream (e.g. if their goal is to make art, paint the life of a working artist: the studio, the work, the recognition, how it feels). Make it feel inevitable and earned.

Coaching tone: ${TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.default}

Rules:
- 2 to 3 short paragraphs, separated by a blank line.
- Second person ("you"). No greeting, no sign-off, no preamble, no quotation marks around the whole thing.
- Concrete and sensory, not vague platitudes.
- Plain prose only — NO markdown, no asterisks or underscores for emphasis, no formatting characters.
Return ONLY the story text.`

  const text = await callClaude(prompt, 700)
  return (text || '').trim()
}

// Pull the first JSON value (object or array) out of a model response, tolerating
// ```json fences or stray prose around it. Throws if nothing parseable is found.
function extractJson(text) {
  const raw = (text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try {
    return JSON.parse(raw)
  } catch (_) {
    const start = raw.search(/[[{]/)
    const end = Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}'))
    if (start !== -1 && end > start) return JSON.parse(raw.slice(start, end + 1))
    throw new Error('No JSON found in model response')
  }
}

const GOAL_CATEGORIES = ['career', 'health', 'wealth', 'relationships', 'creative', 'travel', 'mindset', 'lifestyle']

// Full roadmap for the user's PRIMARY goal, generated by Claude from their own
// words. Returns one goal with an actionable title, a category, three timed
// milestones (3/6/12 months) each with three concrete stepping stones, and a few
// daily actions. The shape mirrors what aiEngine.normalizeAiGoal expects.
export async function generateRoadmap({ name, rawGoal, extra = '', tone = 'default' }) {
  const firstName = (name || '').split(' ')[0] || 'they'
  const dream = [rawGoal, extra].filter((s) => s && s.trim()).join(' — ')

  const prompt = `You are ${firstName}'s personal life coach. Turn their goal into a concrete, achievable roadmap.

Their goal, in their own words: "${dream || rawGoal}"
Coaching tone: ${TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.default}

Build a roadmap with THREE milestones. Default horizons are 3 months, 6 months, and 12 months — but if THEIR goal states its own deadline ("in 6 months", "by June", "this year"), scale the three checkpoints to fit THAT deadline instead (e.g. "6 weeks" / "3 months" / "6 months") so the final milestone lands exactly when they said. Each milestone has exactly THREE stepping stones — the smaller actions that get them there.

TIMELINE RULES — the plan must make sense as a schedule, not just a list:
- The three milestones are a progression: the first builds the foundation, the second is measurable proof of being roughly halfway, and the FINAL milestone IS the goal achieved — its title states the goal's success condition, verifiably done.
- Every milestone must be realistically reachable within its horizon by a busy person starting from today. Too easy wastes the horizon; too hard makes the plan fiction. ("Run a marathon" in 3 months from zero is fiction; a 10K is a foundation.)
- When the goal has a number (money, distance, weight, pages, customers, revenue), give each milestone a concrete sub-target that progresses sensibly toward the total — early milestones can be smaller while habits form; they must add up to the goal.
- Each stepping stone is finishable in a few days to two weeks, and all three of a milestone's stones must comfortably fit inside that milestone's window, in order.

SPECIFICITY TEST: if a milestone or stepping stone would fit a DIFFERENT goal without changes ("build the habit", "do more research", "stay consistent"), it is too generic — rewrite it with the concrete noun, number, or artifact from THIS goal.
- Milestone titles describe a concrete, verifiable outcome (something you could point at and say "done").
- Each stepping stone has TWO parts: a "label" — a 2-3 word name shown on the roadmap path (verb-first, e.g. "Open Japan Fund", "Book flights") — and a "detail": the full verb-first action naming the specific thing to produce, book, buy, contact, or complete.
- "dailyActions" are 3 small things they can do most days to keep momentum, phrased for THIS goal.

Return ONLY this JSON, no prose, no code fences:
{
  "title": "<short actionable goal title, Title Case, no leading 'I want to'>",
  "category": "<one of: ${GOAL_CATEGORIES.join(', ')}>",
  "milestones": [
    { "horizon": "<first checkpoint, e.g. 3 months>", "title": "<specific outcome>", "steps": [{ "label": "<2-3 words>", "detail": "<full verb-first action>" }, { "label": "<2-3 words>", "detail": "<action>" }, { "label": "<2-3 words>", "detail": "<action>" }] },
    { "horizon": "<second checkpoint, e.g. 6 months>", "title": "<specific outcome>", "steps": [{ "label": "<2-3 words>", "detail": "<action>" }, { "label": "<2-3 words>", "detail": "<action>" }, { "label": "<2-3 words>", "detail": "<action>" }] },
    { "horizon": "<final checkpoint, e.g. 12 months>", "title": "<the goal achieved, verifiable>", "steps": [{ "label": "<2-3 words>", "detail": "<action>" }, { "label": "<2-3 words>", "detail": "<action>" }, { "label": "<2-3 words>", "detail": "<action>" }] }
  ],
  "dailyActions": ["<small daily action>", "<small daily action>", "<small daily action>"]
}`

  const response = await callClaude(prompt, 1500)
  const plan = extractJson(response)

  // Validate enough to trust it downstream; normalizeAiGoal is the final guard.
  if (!plan || !Array.isArray(plan.milestones) || plan.milestones.length === 0) {
    throw new Error('Invalid roadmap format')
  }
  return plan
}

// Break a sprint task into a short, ordered list of concrete step titles sized
// to its time horizon (a few hours if it's due today, otherwise a handful of
// days). Returns an array of step strings; the caller assigns the schedule.
export async function generateSprintPlan({ title, horizonDays = 0, count = 4, tone = 'default' }) {
  const isToday = horizonDays <= 0
  const window = isToday
    ? 'today, across the remaining hours'
    : `over the next ${horizonDays} day${horizonDays === 1 ? '' : 's'}`
  const each = isToday ? 'doable in 30–90 minutes' : 'doable in a single day'

  const prompt = `You are Nova, a coach. Break this task into exactly ${count} small, concrete, ordered steps to finish it ${window}: "${title}".

Each step:
- starts with a verb and is specific to THIS task (no filler like "get started")
- is ${each}
- builds on the one before it; the final step completes the task.

Return ONLY a JSON array of ${count} strings, e.g. ["Outline the intro", "Draft section 1", ...]. No prose, no code fences.`

  const res = await callClaude(prompt, 900)
  const arr = extractJson(res)
  const steps = (Array.isArray(arr) ? arr : [])
    .map((s) => (typeof s === 'string' ? s : s?.title))
    .filter((t) => t && String(t).trim())
  if (!steps.length) throw new Error('Invalid sprint plan')
  return steps
}

// Specific, actionable SUPPORTING goals for the other life areas a user cares
// about (from the onboarding survey), grounded in their dream + primary goal —
// so the roadmap is never padded with vague template goals. Returns
// [{ title, category }]; [] on any failure (caller then shows NO supporting
// goal rather than a generic one).
export async function generateSupportingGoals({ name = '', primaryGoal = '', extra = '', domains = [], tone = 'default' }) {
  if (!Array.isArray(domains) || !domains.length) return []
  const firstName = (name || '').split(' ')[0] || 'they'
  const domainList = domains.map((d) => `- ${d.key}: ${d.label}`).join('\n')
  const prompt = `You are ${firstName}'s life coach. Their main goal is: "${primaryGoal}".${extra ? ` They also said: "${extra}".` : ''}

They also care about these other life areas and want ONE concrete goal in each:
${domainList}

For each area, write ONE specific, actionable goal for ${firstName} — something real they could start this week and measure, as a short goal title (Title Case, no leading "I want to"). It MUST be specific: prefer a number, a named habit, a shipped thing, or a concrete milestone, and tie it to their dream where it fits. NEVER vague — do NOT write things like "Build a career you're proud of", "Get healthier", "Reach financial freedom", or "Find balance".

Coaching tone: ${TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.default}

Return ONLY a JSON array, one object per area, no prose, no code fences:
[{ "category": "<the area's key>", "title": "<specific actionable goal title>" }]`

  try {
    const res = await callClaude(prompt, 600)
    const arr = extractJson(res)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((g) => g && typeof g.title === 'string' && g.title.trim())
      .map((g) => ({ title: g.title.trim(), category: typeof g.category === 'string' ? g.category.trim() : '' }))
  } catch (e) {
    console.warn('[Onboarding] supporting-goals generation failed:', e?.message)
    return []
  }
}

// Judge whether the user's stated "most important goal" is real and workable
// enough to build a roadmap around. Returns { ok, message } — when not ok,
// `message` is Nova's warm re-ask for something more specific/attainable.
// Attempt-aware: pass `attempt` (1-based) and previously `rejected` answers so the
// judge holds the SAME bar on every retry instead of softening after the first no.
export async function judgeGoal({ rawGoal, name = '', tone = 'default', attempt = 1, rejected = [] }) {
  const firstName = (name || '').split(' ')[0] || 'there'
  const retryContext = rejected.length
    ? `\nThis is attempt #${attempt}. Their earlier answers were ALREADY REJECTED as not workable: ${rejected.map((r) => `"${r}"`).join(', ')}. Do NOT lower the bar because they have tried before — if this answer is still gibberish, a joke, a trivial variation of a rejected answer, or too vague, reject it again. Persistence means holding the standard, not giving in.`
    : ''
  const prompt = `You are Nova, ${firstName}'s coach. They were asked for the single most important goal they want to tackle first, and answered: "${rawGoal}".${retryContext}

Decide if this is a REAL, workable goal — concrete and attainable enough to build a roadmap around.
- NOT workable: gibberish/keysmash, jokes, empty or throwaway one-word non-answers, impossible/fantasy goals (be immortal, grow taller, time travel), or answers too vague to plan around on their own ("be happy", "be rich", "success", "everything").
- Workable: anything concrete enough to act on, even if ambitious ("start a bakery", "get promoted to manager", "run a marathon", "save $20k", "learn Spanish").
- When you're genuinely unsure whether it's concrete enough to plan around, REJECT and ask for the specific version — never accept just to move on.

Coaching tone to use if you must ask again: ${TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.default}

Return ONLY JSON:
- If workable: {"ok": true}
- If not: {"ok": false, "message": "<1-2 sentences, in the tone above, that name what they said and ask them for a more specific and obtainable goal — give a concrete example of what a real version might look like>"}`

  try {
    const res = await callClaude(prompt, 300)
    const parsed = extractJson(res)
    return { ok: parsed.ok !== false, message: parsed.message || '' }
  } catch (e) {
    // Fail open — never block onboarding on an API hiccup.
    console.warn('[judgeGoal] failed, accepting goal:', e?.message)
    return { ok: true, message: '' }
  }
}

// Distill durable, user-shared facts from the recent conversation into Nova's
// long-term memory (profile.coachMemory). Returns the UPDATED fact list (already
// merged with the existing one by the model), or null when the call failed /
// returned garbage — callers must treat null as a no-op, never as "clear".
export async function distillCoachMemory({ profile, history = [] }) {
  const firstName = (profile?.name || '').split(' ')[0] || 'they'
  const existing = (profile?.coachMemory?.facts || []).map((f) => `- ${f.text}`).join('\n')
  const formalGoals = (profile?.goals || []).map((g) => `- "${g.title}"`).join('\n')
  const recent = history
    .slice(-16)
    .map((m) => `${m.from === 'coach' ? 'Nova' : firstName}: ${m.text}`)
    .join('\n')

  const prompt = `You maintain Nova the coach's long-term memory about ${firstName}.

Current memory:
${existing || '(empty)'}

Their formal goals (already remembered elsewhere — do NOT restate these as facts):
${formalGoals || '(none)'}

Recent conversation:
${recent || '(none)'}

Rewrite the memory as an updated list of AT MOST 15 short facts about ${firstName} that will still matter weeks from now: personal context they shared (work, family, health, upcoming events), preferences, recurring struggles, wins, and commitments. Merge duplicates, update anything stale, and drop small talk. Rules:
- ONLY facts ${firstName} actually stated — never inferred or invented.
- Do NOT store facts that merely restate their formal goals or roadmap — the app remembers their goals separately and permanently; keep only context AROUND the goals (why it matters to them, obstacles, who's involved).
- No sensitive inferences (diagnoses, politics, religion) unless they said it explicitly and it matters for coaching.
- Each fact is one plain sentence, no names of third parties beyond what they shared.

Return ONLY a JSON array of strings, e.g. ["Works in sales at a startup", "Feels most motivated right after morning workouts"]. Return [] if nothing is worth remembering. No prose, no code fences.`

  try {
    const res = await callClaude(prompt, 700)
    const arr = extractJson(res)
    if (!Array.isArray(arr)) return null
    return arr
      .filter((t) => typeof t === 'string' && t.trim())
      .slice(0, 15)
      .map((text) => ({ text: text.trim().slice(0, 200) }))
  } catch (e) {
    console.warn('[Memory] distillation failed:', e?.message)
    return null
  }
}

// Apply a goal-adjustment action from Nova to the goals array. Returns the new
// goals array, or null when the action is a no-op / can't be applied. Exported so
// the caller can apply it against the CURRENT goals at write time (not a snapshot).
export function applyGoalAction(goals, action) {
  const list = Array.isArray(goals) ? goals.slice() : []
  if (!action || !action.type) return null
  if (action.type === 'remove' && action.goalId) {
    const next = list.filter((g) => g.id !== action.goalId)
    return next.length !== list.length ? next : null
  }
  if (action.type === 'edit' && action.goalId && action.title) {
    let changed = false
    const next = list.map((g) => {
      if (g.id === action.goalId) { changed = true; return { ...g, title: String(action.title).trim() } }
      return g
    })
    return changed ? next : null
  }
  if (action.type === 'add' && action.title) {
    return [...list, buildGoal(String(action.title))]
  }
  return null
}

// Context-aware Coach reply — understands the user's tone preference, dream,
// current goals, streak, and the recent conversation, responds in character, and
// (when they clearly ask) adjusts their goals. Returns { reply, action } — the
// caller applies `action` against the current goals via applyGoalAction().
export async function coachRespond({ profile, history = [], userText }) {
  const firstName = (profile?.name || '').split(' ')[0] || 'there'
  const tone = profile?.coachTone || 'default'
  const goals = profile?.goals || []
  const primary = goals.find((g) => g.primary_goal) || goals[0]
  const recent = history
    .slice(-8)
    .map((m) => `${m.from === 'coach' ? 'Nova' : firstName}: ${m.text}`)
    .join('\n')
  const goalList = goals.length
    ? goals.map((g) => `- id:${g.id} | "${g.title}" | ${Math.round(g.progress || 0)}% complete${g === primary ? ' (primary)' : ''}`).join('\n')
    : '(no goals yet)'
  // Long-term memory: distilled facts about THIS user from all their past chats
  // (profile.coachMemory, maintained by distillCoachMemory below). This is what
  // lets Nova remember someone beyond the rolling 60-message history window.
  const memoryFacts = (profile?.coachMemory?.facts || [])
    .map((f) => `- ${f.text}`)
    .join('\n')

  const prompt = `You are Nova, ${firstName}'s personal coach inside the NorthStar app. If they ask your name, it's Nova. Respond to their latest message in character, and — ONLY when they clearly ask — adjust their goals.

About ${firstName}:
- Their dream: "${profile?.dreamDescription || profile?.primaryGoalRaw || 'building the life they want'}"
- Current streak: ${profile?.streak || 0} days

What you remember about ${firstName} from earlier conversations:
${memoryFacts || '(nothing yet — you are still getting to know them)'}

Their current goals:
${goalList}

Coaching tone you must embody: ${TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.default}

Recent conversation:
${recent || '(this is the start of the conversation)'}

${firstName}'s latest message: "${userText}"

Decide if they are explicitly asking to change a goal — add a new one, rename/refocus an existing one, or drop one. Only act when the intent is unambiguous; otherwise just talk. When you do act, your reply should confirm the change warmly.

Return ONLY this JSON, no prose, no code fences:
{
  "reply": "<in-character reply, 1-3 sentences, no name prefix, no quotes>",
  "action": { "type": "none|add|edit|remove", "goalId": "<existing id for edit/remove>", "title": "<new or updated goal title for add/edit>" }
}`

  const text = await callClaude(prompt, 500)

  // Tolerant parse: if the model didn't emit JSON, treat the whole thing as the reply
  // — UNLESS it looks like truncated/garbled JSON, in which case return reply:null so
  // the caller's local fallback speaks instead of rendering raw braces to the user.
  let parsed = null
  try {
    parsed = extractJson(text)
  } catch (_) {
    const t = (text || '').trim()
    return { reply: /^[`{[]/.test(t) ? null : t, action: null }
  }

  const reply = (parsed?.reply || '').trim() || null
  const raw = parsed?.action
  const action = raw && raw.type && raw.type !== 'none' ? raw : null
  return { reply, action }
}

export default {
  runClaude,
  suggestGoalsFromDream,
  suggestMilestonesForGoal,
  suggestStepsForMilestone,
  generateDailyActionsForMilestone,
  generateDreamLifeStory,
  generateRoadmap,
  generateSupportingGoals,
  generateSprintPlan,
  judgeGoal,
  coachRespond,
  distillCoachMemory,
}
