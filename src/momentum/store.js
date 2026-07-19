// ── Momentum roadmap: store glue ─────────────────────────────────────────────
// The bridge between the momentum mechanism and the app's local-first blob. Every
// write goes through the SAME onUpdate(prevProfile => nextProfile) updater the
// rest of the app uses, so changes persist to AsyncStorage + sync to the cloud
// exactly like everything else — no new persistence path. All mutation lives on
// goal.r2; goal.progress is recomputed only for Dreams that have adopted the
// mechanism, so Max's celestial map reflects real momentum without his code
// changing and without touching goals that never opted in.

import {
  R2_KEY, makeR2, makeStone, makeLever, makeTask,
  getR2, orderedStones, currentStone, leverById, todayKey,
  tasksDueOn, isTaskDoneOn, hasR2,
} from './model'
import { dreamProgressPct, isOutcomeMet, stoneMomentum, outcomeProgress, pct } from './engine'
import { normalizeWeights } from './generate'

function clone(r2) {
  return r2 ? JSON.parse(JSON.stringify(r2)) : makeR2()
}

// A tiny, self-contained summary stamped onto r2 on every change. This is what
// Circles read (server-side, out of the member's synced blob) — exactly how the
// app already surfaces streak/progress to circle-mates — so momentum never has to
// be recomputed in SQL. Recency-decayed momentum is captured at write time; it's
// "fresh enough" for accountability and refreshes on the next interaction.
function computeSnapshot(r2) {
  const stones = orderedStones(r2)
  const cur = currentStone(r2)
  const complete = stones.filter((s) => s.status === 'complete').length
  let momentumPct = null
  let outcomeText = null
  let stoneTitle = null
  if (cur) {
    momentumPct = pct(stoneMomentum(r2, cur))
    const op = outcomeProgress(cur)
    outcomeText = op.hasTarget ? op.text : null
    stoneTitle = cur.title
  }
  return {
    momentumPct,
    stoneTitle,
    stoneIndex: cur ? stones.findIndex((s) => s.id === cur.id) : stones.length,
    stoneCount: stones.length,
    complete,
    outcomeText,
    updatedAt: new Date().toISOString(),
  }
}

// Map one goal in the profile, leaving every other goal — and everything Max's
// code owns — untouched.
function updateGoal(onUpdate, goalId, mapGoal) {
  onUpdate((prof) => {
    if (!prof) return prof
    const goals = (prof.goals || []).map((g) => (g.id === goalId ? mapGoal(g) : g))
    return { ...prof, goals }
  })
}

// Mutate a goal's r2 in place (on a clone), then keep goal.progress in step so
// the planet position tracks the mechanism. fn may return a value; we surface it.
function mutateR2(onUpdate, goalId, fn) {
  let ret
  updateGoal(onUpdate, goalId, (g) => {
    const r2 = clone(g[R2_KEY])
    ret = fn(r2, g)
    r2.snapshot = computeSnapshot(r2)
    const next = { ...g, [R2_KEY]: r2 }
    next.progress = dreamProgressPct(next)
    return next
  })
  return ret
}

// ── adoption: turn accepted setup into a live mechanism ──────────────────────
// Accepts fully-edited data from the setup flow: { gap, levers:[{title,weight}],
// stones:[{title,targetMetric,targetValue,targetUnit,direction,tasks:[{title,type,cadenceDays,lever}]}] }.
// First stone becomes current (and gets startedAt today); the rest start locked.
export function buildR2({ gap = 'stretch', levers = [], stones = [], experience = '', currentState = '' } = {}) {
  const r2 = makeR2(gap)
  // Kept so later stones' task generation stays sized to the same person.
  if (experience) r2.experience = experience
  if (currentState) r2.currentState = currentState
  const built = normalizeWeights(levers.filter((l) => l && l.title).map((l) => makeLever(l.title, l.weight)))
  r2.levers = built
  const leverIdByTitle = {}
  built.forEach((l) => { leverIdByTitle[l.title.toLowerCase()] = l.id })

  r2.stones = stones.filter((s) => s && (s.title || s.targetMetric)).map((s, i) => {
    const stone = makeStone({
      title: s.title,
      targetMetric: s.targetMetric,
      targetValue: s.targetValue,
      targetUnit: s.targetUnit,
      startValue: s.startValue,
      direction: s.direction,
      orderIndex: i,
      status: i === 0 ? 'current' : 'locked',
    })
    if (i === 0) stone.startedAt = todayKey()
    stone.tasks = (s.tasks || []).filter((t) => t && t.title).map((t) =>
      makeTask({
        title: t.title,
        type: t.type,
        cadenceDays: t.cadenceDays,
        leverId: t.lever ? leverIdByTitle[String(t.lever).toLowerCase()] || null : t.leverId || null,
      })
    )
    return stone
  })
  return r2
}

// Adopt (or replace) the mechanism on a goal. Distinct from anything Max's
// GoalEditor does — it only ever writes goal.r2 + a derived goal.progress.
export function adoptMechanism(onUpdate, goalId, accepted) {
  const r2 = buildR2(accepted)
  r2.snapshot = computeSnapshot(r2)
  updateGoal(onUpdate, goalId, (g) => {
    const next = { ...g, [R2_KEY]: r2 }
    next.progress = dreamProgressPct(next)
    return next
  })
  return r2
}

export function clearMechanism(onUpdate, goalId) {
  updateGoal(onUpdate, goalId, (g) => {
    const { [R2_KEY]: _drop, ...rest } = g
    return rest
  })
}

// ── the single tap ───────────────────────────────────────────────────────────
// The ONLY input the momentum pipeline needs: toggle one task done/undone for a
// day. No diary, no specifics. Momentum is a pure read over these marks.
export function toggleTaskDone(onUpdate, goalId, stoneId, taskId, dateKey = todayKey()) {
  mutateR2(onUpdate, goalId, (r2) => {
    const stone = (r2.stones || []).find((s) => s.id === stoneId)
    if (!stone) return
    if (!stone.log) stone.log = {}
    const set = new Set(stone.log[dateKey] || [])
    if (set.has(taskId)) set.delete(taskId)
    else set.add(taskId)
    stone.log[dateKey] = [...set]
  })
}

// ── outcome check-in (slow cadence) — the ONLY thing that completes a stone ──
// Records a real-metric value; if it meets the target, completes the stone and
// unlocks the next (carrying the achieved value forward as the next baseline).
// Returns { completed, dreamDone } so the UI can celebrate appropriately.
export function logOutcome(onUpdate, goalId, stoneId, value, dateKey = todayKey()) {
  return mutateR2(onUpdate, goalId, (r2) => {
    const stone = (r2.stones || []).find((s) => s.id === stoneId)
    if (!stone) return { completed: false, dreamDone: false }
    stone.outcomes = (stone.outcomes || []).filter((o) => o.date !== dateKey)
    stone.outcomes.push({ date: dateKey, value: Number(value) })
    stone.outcomes.sort((a, b) => String(a.date).localeCompare(String(b.date)))
    if (stone.startValue == null) stone.startValue = Number(stone.outcomes[0].value)

    let completed = false
    let dreamDone = false
    if (stone.status === 'current' && stone.targetValue != null && isOutcomeMet(stone)) {
      completed = true
      stone.status = 'complete'
      stone.completedAt = new Date().toISOString()
      const ordered = orderedStones(r2)
      const idx = ordered.findIndex((s) => s.id === stone.id)
      const next = ordered[idx + 1]
      if (next) {
        next.status = 'current'
        next.startedAt = dateKey
        if (next.startValue == null) next.startValue = Number(value)
      } else {
        dreamDone = true // last stone met — the whole Dream is realised
      }
    }
    return { completed, dreamDone }
  })
}

// Manual completion — for stones with no numeric target (targetValue null), the
// user marks the checkpoint reached themselves.
export function markStoneComplete(onUpdate, goalId, stoneId, dateKey = todayKey()) {
  return mutateR2(onUpdate, goalId, (r2) => {
    const stone = (r2.stones || []).find((s) => s.id === stoneId)
    if (!stone || stone.status === 'complete') return { completed: false, dreamDone: false }
    stone.status = 'complete'
    stone.completedAt = new Date().toISOString()
    const ordered = orderedStones(r2)
    const idx = ordered.findIndex((s) => s.id === stone.id)
    const next = ordered[idx + 1]
    if (next) { next.status = 'current'; next.startedAt = dateKey }
    return { completed: true, dreamDone: !next }
  })
}

// ── editing stones / tasks / levers (all user-driven) ────────────────────────
export function setLevers(onUpdate, goalId, levers) {
  mutateR2(onUpdate, goalId, (r2) => {
    r2.levers = normalizeWeights((levers || []).filter((l) => l && l.title).map((l) => ({
      id: l.id || makeLever(l.title).id, title: String(l.title).trim(), weight: l.weight,
    })))
  })
}

export function addTask(onUpdate, goalId, stoneId, taskData) {
  mutateR2(onUpdate, goalId, (r2) => {
    const stone = (r2.stones || []).find((s) => s.id === stoneId)
    if (!stone) return
    stone.tasks = [...(stone.tasks || []), makeTask(taskData)]
  })
}

export function updateTask(onUpdate, goalId, stoneId, taskId, patch) {
  mutateR2(onUpdate, goalId, (r2) => {
    const stone = (r2.stones || []).find((s) => s.id === stoneId)
    if (!stone) return
    stone.tasks = (stone.tasks || []).map((t) => (t.id === taskId ? { ...t, ...patch } : t))
  })
}

export function removeTask(onUpdate, goalId, stoneId, taskId) {
  mutateR2(onUpdate, goalId, (r2) => {
    const stone = (r2.stones || []).find((s) => s.id === stoneId)
    if (!stone) return
    stone.tasks = (stone.tasks || []).filter((t) => t.id !== taskId)
  })
}

export function updateStone(onUpdate, goalId, stoneId, patch) {
  mutateR2(onUpdate, goalId, (r2) => {
    r2.stones = (r2.stones || []).map((s) => (s.id === stoneId ? { ...s, ...patch } : s))
  })
}

// ── selectors (pure reads) ───────────────────────────────────────────────────
export function activeDreams(profile) {
  return (profile?.goals || []).filter(hasR2)
}

// The flat, schedule-aware list that powers the Today tab: every task due today
// across ALL Dreams' CURRENT stones, each tagged back to its Dream + lever.
export function collectTodayTasks(profile, dateKey = todayKey()) {
  const out = []
  for (const g of profile?.goals || []) {
    const r2 = getR2(g)
    if (!r2) continue
    const stone = currentStone(r2)
    if (!stone) continue
    for (const t of tasksDueOn(stone, dateKey)) {
      out.push({
        goalId: g.id,
        goalTitle: g.title,
        category: g.category,
        stoneId: stone.id,
        stoneTitle: stone.title,
        task: t,
        lever: leverById(r2, t.leverId),
        done: isTaskDoneOn(stone, t.id, dateKey),
      })
    }
  }
  return out
}
