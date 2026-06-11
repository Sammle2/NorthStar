import { WEEK, NON_NEGOTIABLES } from '../data/schedule.js'
import { dateKey, daysAgo } from './time.js'

// A non-negotiable counts for a day when every scheduled activity carrying
// its `nn` key was logged done that day.
function metOn(logs, date, nnKey) {
  const acts = WEEK[date.getDay()].filter((a) => a.nn === nnKey)
  if (acts.length === 0) return null // not scheduled — doesn't break the chain
  const day = logs[dateKey(date)] || {}
  return acts.every((a) => day[a.id]?.status === 'done')
}

// Current streak: walk backward from today. Today only counts if already met;
// an unmet today doesn't break a streak still in progress.
export function currentStreak(logs, nnKey) {
  let streak = 0
  for (let i = 0; i < 730; i++) {
    const met = metOn(logs, daysAgo(i), nnKey)
    if (met === null) continue
    if (met) streak++
    else if (i === 0) continue
    else break
  }
  return streak
}

export function bestStreak(logs, nnKey) {
  const dates = Object.keys(logs).sort()
  if (dates.length === 0) return 0
  let best = 0
  let run = 0
  const start = new Date(dates[0] + 'T12:00:00')
  const today = new Date()
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const met = metOn(logs, d, nnKey)
    if (met === null) continue
    if (met) {
      run++
      best = Math.max(best, run)
    } else run = 0
  }
  return best
}

export function allStreaks(logs) {
  return NON_NEGOTIABLES.map((nn) => ({
    ...nn,
    current: currentStreak(logs, nn.key),
    best: bestStreak(logs, nn.key),
  }))
}

// Fraction of scheduled activities completed on a date.
export function dayCompletion(logs, date) {
  const acts = WEEK[date.getDay()]
  const day = logs[dateKey(date)] || {}
  const done = acts.filter((a) => day[a.id]?.status === 'done').length
  return { done, total: acts.length, pct: acts.length ? done / acts.length : 0 }
}

// Last `n` days of completion fractions, oldest first — feeds the heat map.
export function heatmap(logs, n = 84) {
  const cells = []
  for (let i = n - 1; i >= 0; i--) {
    const date = daysAgo(i)
    cells.push({ key: dateKey(date), date, ...dayCompletion(logs, date) })
  }
  return cells
}
