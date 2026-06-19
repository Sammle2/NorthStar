// Claude AI Service
// Calls Claude through the `claude-proxy` Supabase Edge Function — the Anthropic
// API key lives ONLY on the server, never in the app bundle. Requests are
// authenticated with the signed-in user's Supabase JWT.
import { getSession } from './supabaseAuth'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseAuth'

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

// Generate vision board keywords from a goal
export async function suggestVisionBoardKeywords(goalTitle, goalDescription, numberOfKeywords = 5) {
  const prompt = `For the goal: "${goalTitle}"
Description: "${goalDescription}"

Suggest ${numberOfKeywords} visual keywords or phrases that represent success, progress, or the achievement of this goal. These will be used to generate inspirational images.

Keywords should be:
- Visual and evocative
- Specific enough to generate good images
- Representing different aspects of the goal
- Easy to visualize

Format as JSON array of objects with:
- keyword: The keyword or phrase
- description: Brief context for image generation

Return ONLY the JSON array.`

  try {
    const response = await callClaude(prompt)
    const keywords = extractJson(response)

    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('Invalid keywords format')
    }

    return keywords
  } catch (error) {
    console.error('Failed to generate vision board keywords:', error?.message)
    throw new Error(error?.message || 'Could not generate keywords. Try again.')
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

Build a roadmap with THREE milestones at 3 months, 6 months, and 12 months. Each milestone has exactly THREE stepping stones — the smaller actions that get them there.

Make EVERYTHING specific and actionable, grounded in THIS person's actual goal — never generic filler:
- Milestone titles describe a concrete, verifiable outcome for that horizon (something you could point at and say "done"). Prefer measurable targets where it makes sense (a number, a shipped thing, a habit held for N days).
- Each stepping stone starts with a verb and is something they could realistically finish in a few days to two weeks.
- Order the milestones and stones so each one builds on the last.
- "dailyActions" are 3 small things they can do most days to keep momentum.

Return ONLY this JSON, no prose, no code fences:
{
  "title": "<short actionable goal title, Title Case, no leading 'I want to'>",
  "category": "<one of: ${GOAL_CATEGORIES.join(', ')}>",
  "milestones": [
    { "horizon": "3 months", "title": "<specific outcome>", "steps": ["<verb-first action>", "<action>", "<action>"] },
    { "horizon": "6 months", "title": "<specific outcome>", "steps": ["<action>", "<action>", "<action>"] },
    { "horizon": "12 months", "title": "<specific outcome>", "steps": ["<action>", "<action>", "<action>"] }
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

// Context-aware Coach reply — understands the user's tone preference, dream,
// current goal, streak, and the recent conversation, and responds in character.
export async function coachRespond({ profile, history = [], userText }) {
  const firstName = (profile?.name || '').split(' ')[0] || 'there'
  const tone = profile?.coachTone || 'default'
  const goals = profile?.goals || []
  const primary = goals.find((g) => g.primary_goal) || goals[0]
  const recent = history
    .slice(-8)
    .map((m) => `${m.from === 'coach' ? 'Coach' : firstName}: ${m.text}`)
    .join('\n')

  const prompt = `You are ${firstName}'s personal life coach inside the NorthStar app. Respond to their latest message in character.

About ${firstName}:
- Their dream: "${profile?.dreamDescription || profile?.primaryGoalRaw || 'building the life they want'}"
- Their main goal right now: "${primary?.title || 'getting started'}"
- Current streak: ${profile?.streak || 0} days

Coaching tone you must embody: ${TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.default}

Recent conversation:
${recent || '(this is the start of the conversation)'}

${firstName}'s latest message: "${userText}"

Reply as the Coach: understand the intent and emotion behind their message, stay true to the tone above, connect it back to their dream/goal when relevant, and give one clear, motivating, actionable response. Keep it to 1-3 sentences. Return ONLY your reply — no name prefix, no quotes.`

  const text = await callClaude(prompt, 400)
  return (text || '').trim()
}

export default {
  runClaude,
  suggestGoalsFromDream,
  suggestMilestonesForGoal,
  suggestStepsForMilestone,
  generateDailyActionsForMilestone,
  suggestVisionBoardKeywords,
  generateDreamLifeStory,
  generateRoadmap,
  coachRespond,
}
