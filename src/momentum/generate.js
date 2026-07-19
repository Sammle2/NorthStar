// ── Momentum roadmap: AI generation ──────────────────────────────────────────
// Claude-backed generation for the momentum mechanism — stone decomposition,
// per-stone task generation, and lever suggestion. Goes through the SAME
// authenticated claude-proxy edge function the rest of the app uses (via the
// exported runClaude); no API key ever touches the bundle. Kept in its own file
// so it never edits the shared aiService.js that Max also works in.
//
// Everything here PROPOSES; the user always edits/accepts before it goes live.

import { runClaude } from '../services/aiService'
import { GAP_SIZES } from './model'

// Self-contained JSON extractor — tolerant of ```json fences and surrounding
// prose, so we don't depend on a private helper inside aiService.
function extractJson(text) {
  if (!text || typeof text !== 'string') return null
  let s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/,'').trim()
  try { return JSON.parse(s) } catch {}
  // Fall back to the first {...} or [...] block.
  const first = s.search(/[[{]/)
  if (first === -1) return null
  const open = s[first]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  for (let i = first; i < s.length; i++) {
    if (s[i] === open) depth++
    else if (s[i] === close) { depth--; if (depth === 0) { try { return JSON.parse(s.slice(first, i + 1)) } catch { return null } } }
  }
  return null
}

function gapStoneRange(gap) {
  const g = GAP_SIZES.find((x) => x.id === gap) || GAP_SIZES[0]
  return g.stones // [min, max]
}

// The safety rail the spec is explicit about — applied to EVERY task prompt, and
// hardest for body/health goals: rhythm and structure only, never numbers a
// clinician should own. No calorie targets, macros, medical or drug guidance.
const SAFETY_RAIL = `HARD RULES — never break these:
- Give CADENCE and STRUCTURE only (e.g. "strength train", "cook at home", "walk after dinner").
- NEVER prescribe specific calorie counts, macros, gram/weight amounts, supplement or medication guidance, or anything medical/clinical.
- NEVER reference diet drugs, fasting extremes, or restriction targets.
- If the goal seems to invite medical specifics, stay at the level of habits and let the user's own plan/clinician fill in the numbers.`

// ── stone decomposition ──────────────────────────────────────────────────────
// Ordered, MEASURABLE checkpoints (never dates), scaled to the gap size. Each
// stone carries a real target value + direction so the outcome engine can track
// it. Returns [] on failure — the setup flow falls back to a manual single stone.
export async function decomposeIntoStones({ title, category = '', categoryBlurb = '', gap = 'stretch', situation = '', currentState = '', experience = '', intensity = '' } = {}) {
  const [min, max] = gapStoneRange(gap)
  const start = currentState || situation
  const prompt = `A person is pursuing this goal (their "Dream"): "${title}"
Category: ${category || 'general'}${categoryBlurb ? ` (${categoryBlurb})` : ''}
${start ? `Where they are now (starting point): ${start}\n` : ''}${experience ? `Their experience level: ${experience}\n` : ''}${intensity ? `Required intensity of this goal: ${intensity}\n` : ''}
Break this into an ORDERED sequence of "stones" — measurable checkpoints on the way there, NOT calendar dates and NOT time-based. Each stone is a concrete, verifiable target that unlocks the next.

Choose the RIGHT NUMBER of stones (about ${min}–${max} as a baseline) with judgment:
- MORE stones for a beginner, a bigger gap, or a high-intensity goal (a marathon needs more stones than a 1-mile run).
- FEWER stones for someone experienced, or a small gap.
Size each stone's increment to their CURRENT state → goal: a beginner gets smaller, closer steps; the first stone should sit just beyond where they are now, the last IS the goal.

For each stone give:
- title: short, motivating name for the checkpoint
- targetMetric: the single real-world number that proves it (e.g. "weight", "clients closed", "5k time")
- targetValue: the numeric value of that metric at this checkpoint (a number only)
- targetUnit: the unit (e.g. "lbs", "clients", "min"), or "" if none
- direction: "down" if a SMALLER number is progress (e.g. weight, race time), otherwise "up"

Rules:
- Stones must be strictly ordered and cumulative — each further along than the last.
- Prefer the SAME metric across stones when the goal is about one number moving (e.g. weight going down each stone).
- Keep them realistic and matched to their level.

Return ONLY a JSON array, no prose:
[{"title":"","targetMetric":"","targetValue":0,"targetUnit":"","direction":"up"}]`

  try {
    const raw = await runClaude(prompt, 1400)
    const arr = extractJson(raw)
    if (!Array.isArray(arr) || !arr.length) return []
    return arr
      .filter((s) => s && (s.title || s.targetMetric))
      .slice(0, 12)
      .map((s) => ({
        title: String(s.title || s.targetMetric || 'Checkpoint').trim(),
        targetMetric: String(s.targetMetric || '').trim(),
        targetValue: s.targetValue == null || s.targetValue === '' ? null : Number(s.targetValue),
        targetUnit: String(s.targetUnit || '').trim(),
        direction: String(s.direction).toLowerCase() === 'down' ? 'down' : 'up',
      }))
  } catch (e) {
    console.warn('[momentum] decomposeIntoStones failed:', e?.message)
    return []
  }
}

// ── task generation ──────────────────────────────────────────────────────────
// The concrete daily habits/schedule items that move the user from here to the
// next stone — scoped to the Dream's category and THIS stone's target. If the
// Dream has levers, tasks are tagged back to a lever by title. Returns [] on
// failure so the caller can let the user add tasks by hand.
export async function generateStoneTasks({ dreamTitle, category = '', categoryBlurb = '', stone, levers = [], experience = '', intensity = '', constraints = '' } = {}) {
  const leverList = (levers || []).map((l) => l.title).filter(Boolean)
  const targetLine = stone?.targetValue != null
    ? `${stone.targetMetric || 'target'} ${stone.direction === 'down' ? 'down to' : 'up to'} ${stone.targetValue}${stone.targetUnit ? ' ' + stone.targetUnit : ''}`
    : (stone?.targetMetric || stone?.title || '')

  const prompt = `Goal ("Dream"): "${dreamTitle}"
Category: ${category || 'general'}${categoryBlurb ? ` (${categoryBlurb})` : ''}
Current stone (checkpoint) to reach: "${stone?.title || ''}" — target: ${targetLine}
${experience ? `Their experience level: ${experience}\n` : ''}${intensity ? `Required intensity: ${intensity}\n` : ''}${constraints ? `Constraints to respect: ${constraints}\n` : ''}${leverList.length ? `This goal is split into these levers (areas): ${leverList.join(', ')}. Tag each task to the ONE lever it belongs to (use the exact lever name), or null if it fits none.\n` : ''}
Design the concrete daily habits and scheduled items that move the user toward THIS stone. 3–6 tasks, matched to their experience level and the goal's required intensity — gentler and simpler for a beginner, harder/more frequent for an advanced or high-intensity goal — and fitting any constraints.

For each task:
- title: short imperative (e.g. "Strength train", "Cook dinner at home")
- type: "habit" (recurring rhythm) | "schedule" (specific days) | "one_off" (do once)
- cadenceDays: "daily", OR an array of weekday tokens from ["mon","tue","wed","thu","fri","sat","sun"] for schedule tasks, OR null for one_off
${leverList.length ? '- lever: the exact lever name it belongs to, or null' : ''}

${SAFETY_RAIL}

Return ONLY a JSON array, no prose:
[{"title":"","type":"habit","cadenceDays":"daily"${leverList.length ? ',"lever":null' : ''}}]`

  try {
    const raw = await runClaude(prompt, 1200)
    const arr = extractJson(raw)
    if (!Array.isArray(arr) || !arr.length) return []
    return arr
      .filter((t) => t && t.title)
      .slice(0, 8)
      .map((t) => ({
        title: String(t.title).trim(),
        type: ['habit', 'schedule', 'one_off'].includes(t.type) ? t.type : 'habit',
        cadenceDays: normalizeGenCadence(t.type, t.cadenceDays),
        lever: t.lever ? String(t.lever).trim() : null,
      }))
  } catch (e) {
    console.warn('[momentum] generateStoneTasks failed:', e?.message)
    return []
  }
}

function normalizeGenCadence(type, cadence) {
  if (type === 'one_off') return null
  if (Array.isArray(cadence)) return cadence
  return 'daily'
}

// ── lever suggestion ─────────────────────────────────────────────────────────
// Only suggests levers when the goal genuinely splits into parallel contributing
// areas (weight loss → Diet + Exercise). Returns [] for single-track goals —
// those skip levers entirely. Weights sum to ~1.0.
export async function suggestLevers({ title, category = '' } = {}) {
  const prompt = `Goal ("Dream"): "${title}"
Category: ${category || 'general'}

Some goals are driven by TWO OR MORE parallel areas of effort ("levers") — e.g. losing weight is driven by Diet AND Exercise. Others are a single track with no natural split.

Decision rule: only list a lever if it's INSTRUMENTAL to THIS outcome. If an area would be worth pursuing on its own even without this goal, it is NOT a lever here (it would be its own separate goal).

If this goal has a natural split, return 2–3 levers with weights that sum to 1.0 (heavier = more responsible for the outcome). If it's a single-track goal, return an empty array.

Return ONLY JSON, no prose:
{"levers":[{"title":"Diet","weight":0.6},{"title":"Exercise","weight":0.4}]}`

  try {
    const raw = await runClaude(prompt, 500)
    const parsed = extractJson(raw)
    const arr = parsed && Array.isArray(parsed.levers) ? parsed.levers : Array.isArray(parsed) ? parsed : []
    const levers = arr
      .filter((l) => l && l.title)
      .slice(0, 4)
      .map((l) => ({ title: String(l.title).trim(), weight: Number(l.weight) > 0 ? Number(l.weight) : null }))
    if (levers.length < 2) return [] // one or zero → no meaningful split
    return normalizeWeights(levers)
  } catch (e) {
    console.warn('[momentum] suggestLevers failed:', e?.message)
    return []
  }
}

// Make weights sane and sum to 1.0 (even split when the model didn't give usable ones).
export function normalizeWeights(levers) {
  if (!levers.length) return levers
  const haveAll = levers.every((l) => Number(l.weight) > 0)
  if (!haveAll) return levers.map((l) => ({ ...l, weight: Math.round((1 / levers.length) * 100) / 100 }))
  const sum = levers.reduce((a, l) => a + Number(l.weight), 0)
  return levers.map((l) => ({ ...l, weight: Math.round((Number(l.weight) / sum) * 100) / 100 }))
}
