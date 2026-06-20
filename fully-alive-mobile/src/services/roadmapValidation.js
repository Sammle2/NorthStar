// Roadmap validation — when the user overrides the AI's suggested goal,
// milestones, or stepping stones, check whether their edited plan still moves
// them toward their dream. The user always gets the final say; this just warns.
//
// Claude-backed via the server-side proxy (no user API key). Falls back to a
// local heuristic if the AI is unreachable so the warning flow never blocks.
import { runClaude } from './aiService'

// Returns { aligned: boolean, warning: string | null }
export async function validateGoalAgainstDream({ dream, goal }) {
  try {
    return await validateWithClaude({ dream, goal })
  } catch (e) {
    // Network/parse failure / AI not configured — fall through to the heuristic.
    console.warn('Claude validation failed, using heuristic:', e?.message)
  }
  return heuristicValidate({ dream, goal })
}

async function validateWithClaude({ dream, goal }) {
  const plan = goal.milestones
    .map((m) => `- [${m.horizon}] ${m.title}\n` + (m.steps || []).map((s) => `    • ${s.title}`).join('\n'))
    .join('\n')

  const prompt = `A user's dream: "${dream || 'not specified'}"

Their goal: "${goal.title}"
Their plan:
${plan}

Will following this plan plausibly move the user toward their dream? Be encouraging but honest. Respond with ONLY a JSON object:
{"aligned": true|false, "warning": "one short sentence shown to the user ONLY if aligned is false, explaining the gap and a gentle suggestion"}`

  const text = await runClaude(prompt, 256)
  const parsed = JSON.parse(text || '{}')
  return {
    aligned: parsed.aligned !== false,
    warning: parsed.aligned === false ? parsed.warning || null : null,
  }
}

// Local heuristic — catches the obvious "this edit probably won't get you there"
// cases without an LLM: an empty plan, or a goal/plan that shares no language
// with the dream at all.
function heuristicValidate({ dream, goal }) {
  const milestones = goal.milestones || []
  const totalSteps = milestones.reduce((n, m) => n + (m.steps || []).filter((s) => s.title?.trim()).length, 0)
  const titledMs = milestones.filter((m) => m.title?.trim()).length

  if (titledMs === 0 || totalSteps === 0) {
    return {
      aligned: false,
      warning:
        'This plan has no real milestones or steps yet — without concrete actions it’s hard to make progress toward your dream.',
    }
  }

  if (dream && dream.trim().length > 12) {
    // Compare on 4-char stems so "health" ↔ "healthy", "run" ↔ "running" match.
    const dreamStems = stemSet(dream)
    const planStems = stemSet(goal.title + ' ' + milestones.map((m) => m.title + ' ' + (m.steps || []).map((s) => s.title).join(' ')).join(' '))
    let overlap = 0
    dreamStems.forEach((w) => { if (planStems.has(w)) overlap++ })
    // Only warn when the dream is reasonably specific AND the plan shares nothing
    // with it — we'd rather miss an edge case than nag someone with a good plan.
    if (dreamStems.size >= 4 && overlap === 0) {
      return {
        aligned: false,
        warning:
          'This goal doesn’t seem connected to the dream you described. That can be fine — just make sure it’s a step you truly want.',
      }
    }
  }

  return { aligned: true, warning: null }
}

const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'with', 'that', 'this', 'have', 'want', 'will', 'a', 'an', 'to', 'of', 'in', 'on', 'be', 'is', 'my', 'me', 'i', 'it', 'so', 'or', 'as', 'at', 'by', 'we', 'us', 'full', 'real', 'more', 'into', 'them', 'they', 'over', 'just'])
function stemSet(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
      .map((w) => w.slice(0, 4)), // crude stem: first 4 chars
  )
}

export default { validateGoalAgainstDream }
