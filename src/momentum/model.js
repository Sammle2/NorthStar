// ── Momentum roadmap: data model ─────────────────────────────────────────────
// The "how goals actually work" mechanism that lives UNDER Max's celestial-map
// UI and his 5-category framework. A Dream is just one of the user's existing
// goals (profile.goals[i] — it already carries id/title/category/progress and
// renders as a planet). This module hangs the momentum mechanism off that goal
// under a single namespaced key, `goal.r2`, that none of the roadmap-UI /
// category code ever reads or writes — so the two systems never collide.
//
//   goal.r2 = {
//     version, gap,                       // gap size chosen at Dream setup
//     levers: [ { id, title, weight } ],  // optional; [] = this Dream has no split
//     stones: [ Stone… ],                 // ordered checkpoints, not dates
//   }
//   Stone = {
//     id, orderIndex, title,
//     targetMetric, targetValue, targetUnit, startValue, direction,  // real target
//     status: 'locked' | 'current' | 'complete',
//     tasks: [ Task… ],
//     log: { [dateKey]: [taskId…] },      // single-tap done marks per day
//     outcomes: [ { date, value } ],      // periodic real-metric check-ins
//     completedAt,
//   }
//   Task = { id, leverId|null, type: 'habit'|'one_off'|'schedule', title, cadenceDays }
//
// NOTHING here has a deadline. Progression is by hitting a stone's outcome
// target, never by a calendar date.

export const R2_KEY = 'r2'
export const R2_VERSION = 1

// The three gap sizes we ask for at Dream setup — they only scale how many
// stones Claude proposes, nothing else.
export const GAP_SIZES = [
  { id: 'stretch', label: 'A stretch', hint: 'A real reach, but within sight', stones: [3, 5] },
  { id: 'transformation', label: 'A transformation', hint: 'A different version of you', stones: [5, 7] },
  { id: 'pursuit', label: 'A long pursuit', hint: 'A years-long climb', stones: [7, 10] },
]

export const TASK_TYPES = ['habit', 'schedule', 'one_off']

// 3-letter weekday tokens, indexed by Date.getDay() (0 = Sunday).
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// ── local-date keys ──────────────────────────────────────────────────────────
// LOCAL components, never toISOString() (UTC) — an evening check-in must not land
// on tomorrow for anyone west of Greenwich. Kept self-contained so this module
// has no dependency on the app store.
export function dateKeyOf(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function todayKey() {
  return dateKeyOf(new Date())
}
export function weekdayOf(dateKey) {
  // Parse as local midnight (append T00:00) so the weekday matches the user's day.
  const d = dateKey ? new Date(`${dateKey}T00:00:00`) : new Date()
  return WEEKDAYS[d.getDay()]
}
export function addDaysKey(dateKey, n) {
  const d = new Date(`${dateKey}T00:00:00`)
  d.setDate(d.getDate() + n)
  return dateKeyOf(d)
}
// Whole days from dateKey a → b (b defaults to today). Positive when b is later.
export function daysBetween(aKey, bKey = todayKey()) {
  const a = new Date(`${aKey}T00:00:00`).getTime()
  const b = new Date(`${bKey}T00:00:00`).getTime()
  return Math.round((b - a) / 86400000)
}

let _seq = 0
export function uid(prefix = 'm') {
  _seq = (_seq + 1) % 100000
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}_${_seq}`
}

// ── constructors ─────────────────────────────────────────────────────────────
export function makeR2(gap = 'stretch') {
  return { version: R2_VERSION, gap, levers: [], stones: [] }
}

export function makeLever(title, weight = null) {
  return { id: uid('lever'), title: String(title || '').trim(), weight }
}

export function makeStone({ title, targetMetric = '', targetValue = null, targetUnit = '', startValue = null, direction = 'up', orderIndex = 0, status = 'locked' } = {}) {
  return {
    id: uid('stone'),
    orderIndex,
    title: String(title || '').trim(),
    targetMetric: String(targetMetric || '').trim(),
    targetValue: targetValue == null || targetValue === '' ? null : Number(targetValue),
    targetUnit: String(targetUnit || '').trim(),
    startValue: startValue == null || startValue === '' ? null : Number(startValue),
    direction: direction === 'down' ? 'down' : 'up', // 'up' = grow toward target, 'down' = shrink toward it
    status,
    tasks: [],
    log: {},
    outcomes: [],
    completedAt: null,
  }
}

export function makeTask({ title, type = 'habit', leverId = null, cadenceDays = 'daily' } = {}) {
  const t = TASK_TYPES.includes(type) ? type : 'habit'
  return {
    id: uid('task'),
    leverId: leverId || null,
    type: t,
    title: String(title || '').trim(),
    // one-offs carry no cadence (they show until done once); habit/schedule carry
    // 'daily' or a FIXED weekday array — no flexible day-banking in v1.
    cadenceDays: t === 'one_off' ? null : normalizeCadence(cadenceDays),
  }
}

export function normalizeCadence(cadence) {
  if (cadence === 'daily' || cadence == null) return 'daily'
  if (Array.isArray(cadence)) {
    const days = cadence.map((d) => String(d).slice(0, 3).toLowerCase()).filter((d) => WEEKDAYS.includes(d))
    // De-dupe + order canonically; empty or all-7 collapses to 'daily'.
    const set = WEEKDAYS.filter((d) => days.includes(d))
    return set.length === 0 || set.length === 7 ? 'daily' : set
  }
  return 'daily'
}

// ── reading the mechanism off a goal ─────────────────────────────────────────
export function getR2(goal) {
  return goal && goal[R2_KEY] ? goal[R2_KEY] : null
}
export function hasR2(goal) {
  const r2 = getR2(goal)
  return !!(r2 && Array.isArray(r2.stones) && r2.stones.length)
}
export function orderedStones(r2) {
  if (!r2 || !Array.isArray(r2.stones)) return []
  return [...r2.stones].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
}
export function currentStone(r2) {
  const stones = orderedStones(r2)
  return stones.find((s) => s.status === 'current') || null
}
export function leverById(r2, leverId) {
  if (!leverId || !r2) return null
  return (r2.levers || []).find((l) => l.id === leverId) || null
}

// ── scheduling ───────────────────────────────────────────────────────────────
// Is this task on the schedule for the given day? one-offs stay "due" every day
// until they've been marked done once (in ANY day's log); habit/schedule follow
// their cadence. Locked/complete stones don't surface tasks — only the current one.
export function isTaskDueOn(task, dateKey, stone) {
  if (!task) return false
  if (task.type === 'one_off') return !isOneOffDone(task, stone)
  const cadence = task.cadenceDays || 'daily'
  if (cadence === 'daily') return true
  return Array.isArray(cadence) && cadence.includes(weekdayOf(dateKey))
}

export function isOneOffDone(task, stone) {
  if (!stone || !stone.log) return false
  return Object.values(stone.log).some((ids) => Array.isArray(ids) && ids.includes(task.id))
}

// Tasks scheduled on `dateKey` for a stone, optionally filtered to one lever.
export function tasksDueOn(stone, dateKey, leverId) {
  if (!stone || !Array.isArray(stone.tasks)) return []
  return stone.tasks.filter(
    (t) => isTaskDueOn(t, dateKey, stone) && (leverId === undefined || (t.leverId || null) === (leverId || null))
  )
}

export function isTaskDoneOn(stone, taskId, dateKey) {
  const ids = stone && stone.log ? stone.log[dateKey] : null
  return Array.isArray(ids) && ids.includes(taskId)
}

// Human label for a task's cadence, e.g. "Daily", "Mon·Wed·Fri", "One-time".
const TITLE = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }
export function cadenceLabel(task) {
  if (!task || task.type === 'one_off' || task.cadenceDays == null) return 'One-time'
  const c = task.cadenceDays
  if (c === 'daily') return 'Daily'
  if (Array.isArray(c)) {
    const set = c.join(',')
    if (set === 'mon,tue,wed,thu,fri') return 'Weekdays'
    if (set === 'sat,sun') return 'Weekends'
    return c.map((d) => TITLE[d] || d).join('·')
  }
  return 'Daily'
}
