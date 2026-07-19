// ── Momentum roadmap: the engine ─────────────────────────────────────────────
// Two DISTINCT signals the spec is emphatic about never conflating:
//
//   • Momentum — a recency-weighted rolling average of planned-vs-completed
//     TASKS for the current stone. Built from single taps. This is what's shown
//     constantly and what Circles see. It never completes a stone.
//   • Outcome  — the real-world metric (weight, clients closed…), checked in on
//     its own slow cadence. This is the ONLY thing that completes a stone.
//
// Momentum can sit at 100% while an outcome plateaus — that's a signal to adjust
// tasks/target, never "user failure".

import {
  addDaysKey, daysBetween, todayKey,
  tasksDueOn, isTaskDoneOn, orderedStones, currentStone,
} from './model'

// Recurring consistency only — one-offs are milestones, not a rhythm, so they
// never move the momentum ratio (they'd flip in/out of "due" the day they're done).
const isRhythm = (t) => t && t.type !== 'one_off'

// ── core: recency-weighted momentum over a trailing window ────────────────────
// Returns { score: 0..1, daysWithData } or null when there's no signal yet.
// Days where nothing was scheduled carry no signal and are skipped (a rest day
// must not read as 0%). Days where tasks WERE due but untouched count as 0 —
// that's the "an unopened day logs as incomplete" rule. Recency weight halves
// every `halfLife` days, so one bad day can't erase weeks of consistency.
export function momentumScore(stone, { leverId, asOf = todayKey(), windowDays = 14, halfLife = 7 } = {}) {
  if (!stone) return null
  // Don't reach back before the stone actually became current (if we know when).
  const cap = stone.startedAt ? Math.max(0, daysBetween(stone.startedAt, asOf)) : Infinity
  let wsum = 0
  let acc = 0
  let daysWithData = 0
  for (let age = 0; age < windowDays; age++) {
    if (age > cap) break
    const day = addDaysKey(asOf, -age)
    const due = tasksDueOn(stone, day, leverId).filter(isRhythm)
    if (due.length === 0) continue
    const done = due.filter((t) => isTaskDoneOn(stone, t.id, day)).length
    const w = Math.pow(0.5, age / halfLife)
    acc += w * (done / due.length)
    wsum += w
    daysWithData += 1
  }
  if (wsum === 0) return null
  return { score: acc / wsum, daysWithData }
}

// Per-lever momentum bars for the current stone: [{ id, title, weight, score|null }].
export function leverMomenta(r2, stone, opts = {}) {
  if (!r2 || !Array.isArray(r2.levers)) return []
  return r2.levers.map((l) => {
    const m = momentumScore(stone, { ...opts, leverId: l.id })
    return { id: l.id, title: l.title, weight: l.weight, score: m ? m.score : null }
  })
}

// One stone-level momentum. With levers, combine each lever's score by its weight
// (renormalised over the levers that actually have data yet); without levers, or
// before any lever has history, fall back to the flat all-tasks score.
export function stoneMomentum(r2, stone, opts = {}) {
  const flat = momentumScore(stone, opts)
  const levers = r2 && Array.isArray(r2.levers) ? r2.levers : []
  if (!levers.length) return flat ? flat.score : null

  let wsum = 0
  let acc = 0
  for (const l of levers) {
    const m = momentumScore(stone, { ...opts, leverId: l.id })
    if (!m) continue
    const w = Number(l.weight) > 0 ? Number(l.weight) : 0
    if (w <= 0) continue
    acc += w * m.score
    wsum += w
  }
  if (wsum === 0) return flat ? flat.score : null
  return acc / wsum
}

// ── outcome ──────────────────────────────────────────────────────────────────
// Direction-aware progress toward a stone's real target. `direction: 'down'`
// (e.g. lose weight) means shrinking the metric IS progress.
export function outcomeProgress(stone) {
  if (!stone || stone.targetValue == null) {
    return { hasTarget: false, met: stone ? stone.status === 'complete' : false, pct: null, current: null }
  }
  const logs = Array.isArray(stone.outcomes) ? [...stone.outcomes].sort((a, b) => String(a.date).localeCompare(String(b.date))) : []
  const start = stone.startValue != null ? Number(stone.startValue) : logs.length ? Number(logs[0].value) : null
  const current = logs.length ? Number(logs[logs.length - 1].value) : start
  const target = Number(stone.targetValue)
  const down = stone.direction === 'down'

  let met = false
  let pct = 0
  if (start == null || current == null) {
    // No baseline yet — can't show a bar, only the raw current vs target.
    return { hasTarget: true, met: false, pct: null, current, start, target, unit: stone.targetUnit, direction: stone.direction }
  }
  const span = down ? start - target : target - start
  const moved = down ? start - current : current - start
  met = down ? current <= target : current >= target
  pct = span === 0 ? (met ? 1 : 0) : Math.max(0, Math.min(1, moved / span))

  return {
    hasTarget: true,
    met,
    pct,
    start,
    current,
    target,
    moved,
    span,
    unit: stone.targetUnit,
    metric: stone.targetMetric,
    direction: stone.direction,
    text: outcomeText({ moved, span, current, target, start, unit: stone.targetUnit, down }),
  }
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

function outcomeText({ moved, span, current, target, start, unit, down }) {
  const u = unit ? ` ${unit}` : ''
  if (start == null) return `${fmt(current)} / ${fmt(target)}${u}`
  const word = down ? 'down' : 'up'
  return `${word} ${fmt(Math.max(0, moved))} of ${fmt(Math.abs(span))}${u}`
}

export function isOutcomeMet(stone) {
  return outcomeProgress(stone).met
}

// A PASSIVE, informational pace projection — never a deadline, never something
// that can be "missed". Needs ≥2 real check-ins moving the right way; returns
// null on a plateau (rate ≤ 0), which is the cue to prompt a supportive adjust.
export function paceEta(stone) {
  if (!stone || stone.targetValue == null) return null
  const logs = Array.isArray(stone.outcomes) ? [...stone.outcomes].sort((a, b) => String(a.date).localeCompare(String(b.date))) : []
  if (logs.length < 2) return null
  const down = stone.direction === 'down'
  const first = logs[0]
  const last = logs[logs.length - 1]
  const elapsed = daysBetween(first.date, last.date)
  if (elapsed <= 0) return null
  const moved = down ? Number(first.value) - Number(last.value) : Number(last.value) - Number(first.value)
  const ratePerDay = moved / elapsed
  if (ratePerDay <= 0) return null // plateauing or going backward — no honest ETA
  const remaining = down ? Number(last.value) - Number(stone.targetValue) : Number(stone.targetValue) - Number(last.value)
  if (remaining <= 0) return { days: 0, text: 'at your target' }
  const days = Math.ceil(remaining / ratePerDay)
  return { days, text: paceText(days) }
}

function paceText(days) {
  if (days <= 0) return 'at your target'
  if (days <= 10) return `~${days} day${days === 1 ? '' : 's'} at this pace`
  const weeks = Math.round(days / 7)
  if (weeks < 9) return `~${weeks} week${weeks === 1 ? '' : 's'} at this pace`
  const months = Math.round(days / 30)
  return `~${months} month${months === 1 ? '' : 's'} at this pace`
}

// ── progress for Max's planet UI ─────────────────────────────────────────────
// 0..100 derived from stone position + current-stone outcome, so a Dream that has
// adopted the momentum mechanism still positions correctly on the celestial map.
// Goals WITHOUT r2 are never touched — the store only writes this back for r2 ones.
export function dreamProgressPct(goal) {
  const r2 = goal && goal.r2
  const stones = orderedStones(r2)
  if (!stones.length) return typeof goal?.progress === 'number' ? goal.progress : 0
  const complete = stones.filter((s) => s.status === 'complete').length
  const cur = currentStone(r2)
  let within = 0
  if (cur) {
    const op = outcomeProgress(cur)
    within = op.pct != null ? op.pct : 0
  }
  const pct = ((complete + within) / stones.length) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

// "your consistency's been solid but the outcome hasn't moved" — the supportive
// nudge condition: strong sustained momentum, real check-ins, target not met and
// not actually moving. Drives a gentle prompt, never a failure state.
export function shouldNudgeAdjust(r2, stone, opts = {}) {
  if (!stone || stone.status !== 'current') return false
  const m = stoneMomentum(r2, stone, opts)
  if (m == null || m < 0.7) return false
  const op = outcomeProgress(stone)
  if (!op.hasTarget || op.met) return false
  const eta = paceEta(stone) // null when plateauing
  const logs = stone.outcomes || []
  return logs.length >= 2 && eta == null
}

// Round a 0..1 score to a whole-percent for display; null → null.
export function pct(score) {
  return score == null ? null : Math.round(score * 100)
}
