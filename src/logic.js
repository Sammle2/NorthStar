import { dateKey, uid } from './storage'

// ---------- streaks: instant reset, per accepted goal ----------
export function reconcileStreaks(state) {
  const today = dateKey()
  const yesterday = dateKey(new Date(Date.now() - 86400000))
  const streaks = { ...state.streaks }
  for (const dream of state.dreams) {
    for (const goal of dream.goals) {
      if (!goal.accepted) continue
      const s = streaks[goal.id] || { current: 0, best: 0, lastCompletedDate: null }
      // Broken: last completion is older than yesterday → reset instantly.
      if (s.lastCompletedDate && s.lastCompletedDate < yesterday && s.lastCompletedDate !== today) {
        s.current = 0
      }
      streaks[goal.id] = s
    }
  }
  return streaks
}

export function bumpStreak(streaks, goalId) {
  const today = dateKey()
  const s = streaks[goalId] || { current: 0, best: 0, lastCompletedDate: null }
  if (s.lastCompletedDate === today) return streaks // already counted today
  const next = { ...s, current: s.current + 1, lastCompletedDate: today }
  next.best = Math.max(next.best, next.current)
  return { ...streaks, [goalId]: next }
}

export function topStreak(streaks) {
  return Math.max(0, ...Object.values(streaks).map((s) => s.current))
}

// ---------- goal progress: every daily action is a measurable % ----------
// A goal = its one-off steps once + ~30 reps of each daily routine.
const ROUTINE_REPS = 30

export function goalUnits(goal) {
  const routines = goal.steps.filter((s) => s.routine).length
  const oneOffs = goal.steps.length - routines
  return Math.max(1, oneOffs + routines * ROUTINE_REPS)
}

export function unitsDone(state, goalId) {
  let n = 0
  for (const day of Object.values(state.tasks)) {
    for (const t of day) if (t.linkedGoalId === goalId && t.completed) n++
  }
  return n
}

export function goalPct(state, goal) {
  return Math.min(100, (unitsDone(state, goal.id) / goalUnits(goal)) * 100)
}

export function findGoal(state, goalId) {
  for (const dream of state.dreams)
    for (const goal of dream.goals) if (goal.id === goalId) return { dream, goal }
  return null
}

// has a one-off step already been completed on any prior day?
function stepDone(state, stepId) {
  for (const day of Object.values(state.tasks)) {
    for (const t of day) if (t.stepId === stepId && t.completed) return true
  }
  return false
}

// ---------- daily task generation from accepted goals ----------
export function generateTasksFor(state, key = dateKey()) {
  if (state.tasks[key]?.length) return state.tasks[key]
  const routine = []
  const oneOff = []
  for (const dream of state.dreams) {
    for (const goal of dream.goals) {
      if (!goal.accepted) continue
      for (const step of goal.steps) {
        if (!step.routine && stepDone(state, step.id)) continue // one-offs don't come back
        const t = {
          id: uid(),
          stepId: step.id,
          title: step.title,
          category: dream.category,
          linkedGoalId: goal.id,
          completed: false,
          skipped: false,
          notes: '',
        }
        if (step.routine) routine.push(t)
        else oneOff.push(t)
      }
    }
  }
  // 2-3 high-priority: routines first, topped up with one-offs not yet done.
  const high = [...routine.slice(0, 3)]
  if (high.length < 2) high.push(...oneOff.slice(0, 2 - high.length))
  const highIds = new Set(high.map((t) => t.id))
  const low = [...routine, ...oneOff.slice(0, 2)].filter((t) => !highIds.has(t.id))
  return [
    ...high.map((t) => ({ ...t, priority: 'high' })),
    ...low.slice(0, 4).map((t) => ({ ...t, priority: 'low' })),
  ]
}

// ---------- 1% better engine ----------
export function onePercent(state) {
  const keys = Object.keys(state.tasks).sort()
  let daysActive = 0
  let daysImproved = 0
  const catWins = {}
  for (const k of keys) {
    const day = state.tasks[k]
    const high = day.filter((t) => t.priority === 'high')
    const done = day.filter((t) => t.completed)
    if (day.length) daysActive++
    if (high.length && high.every((t) => t.completed)) daysImproved++
    for (const t of done) catWins[t.category] = (catWins[t.category] || 0) + 1
  }
  // Compounding 1% per fully-won day.
  const compound = Math.pow(1.01, daysImproved)
  const today = state.tasks[dateKey()] || []
  const todayHigh = today.filter((t) => t.priority === 'high')
  const todayWon = todayHigh.length > 0 && todayHigh.every((t) => t.completed)
  return {
    daysActive,
    daysImproved,
    compoundPct: Math.round((compound - 1) * 1000) / 10, // e.g. 12.7
    catWins,
    todayWon,
  }
}

// ---------- weekly rollup for Jarvis ----------
export function weekContext(state) {
  let done = 0
  let total = 0
  const skipped = {}
  for (let i = 0; i < 7; i++) {
    const k = dateKey(new Date(Date.now() - i * 86400000))
    for (const t of state.tasks[k] || []) {
      if (t.priority !== 'high') continue
      total++
      if (t.completed) done++
      if (t.skipped) skipped[t.title] = (skipped[t.title] || 0) + 1
    }
  }
  const mostSkipped = Object.entries(skipped).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  const moods = []
  for (let i = 0; i < 7; i++) {
    const r = state.reflections[dateKey(new Date(Date.now() - i * 86400000))]
    if (r?.mood) moods.push(r.mood)
  }
  return {
    weekCompletion: total ? done / total : 0,
    highDone: done,
    highTotal: total,
    mostSkipped,
    avgMood: moods.length ? +(moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : null,
    onePercent: onePercent(state),
    dreams: state.dreams.map((d) => d.title),
  }
}
