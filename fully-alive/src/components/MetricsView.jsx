import { useMemo } from 'react'
import { CATEGORIES, WEEK } from '../data/schedule.js'
import { dateKey, daysAgo } from '../lib/time.js'
import { dayCompletion } from '../lib/streaks.js'
import { getMoods, getProfile } from '../lib/store.js'

function weekStats(logs) {
  let done = 0
  let total = 0
  const byCat = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, { done: 0, total: 0 }]))
  for (let i = 0; i < 7; i++) {
    const date = daysAgo(i)
    const acts = WEEK[date.getDay()]
    const dayLog = logs[dateKey(date)] || {}
    for (const a of acts) {
      total++
      byCat[a.category].total++
      if (dayLog[a.id]?.status === 'done') {
        done++
        byCat[a.category].done++
      }
    }
  }
  return { done, total, pct: total ? done / total : 0, byCat }
}

export default function MetricsView({ logs }) {
  const profile = getProfile()
  const week = useMemo(() => weekStats(logs), [logs])
  const moods = getMoods()

  const moodVals = Array.from({ length: 7 }, (_, i) => moods[dateKey(daysAgo(i))]).filter(Boolean)
  const avgMood = moodVals.length
    ? (moodVals.reduce((a, b) => a + b, 0) / moodVals.length).toFixed(1)
    : '—'

  const bestDay = useMemo(() => {
    let best = null
    for (let i = 0; i < 7; i++) {
      const date = daysAgo(i)
      const c = dayCompletion(logs, date)
      if (!best || c.pct > best.pct) best = { date, ...c }
    }
    return best
  }, [logs])

  const daysIn =
    Math.floor((new Date() - new Date(profile.startDate + 'T00:00:00')) / 86400000) + 1
  const yearPct = Math.min(100, Math.round((daysIn / 365) * 100))

  const verdict =
    week.pct >= 0.95
      ? 'Locked in. This is the standard.'
      : week.pct >= 0.7
        ? 'Strong week. Close the gap to 95%.'
        : week.pct > 0
          ? 'Slipping. Pick one non-negotiable and rebuild from there.'
          : 'Blank slate. Log today and the data starts working for you.'

  return (
    <>
      <header className="hero" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 38 }}>Your Becoming</h1>
        <p className="sub">{verdict}</p>
      </header>

      <div className="stat-row">
        <div className="card stat">
          <div className="big" style={{ color: week.pct >= 0.95 ? 'var(--c-movement)' : week.pct >= 0.7 ? 'var(--c-learning)' : 'var(--ink)' }}>
            {Math.round(week.pct * 100)}%
          </div>
          <div className="lbl">7-day completion · target 95%</div>
        </div>
        <div className="card stat">
          <div className="big">{week.done}</div>
          <div className="lbl">activities completed this week</div>
        </div>
        <div className="card stat">
          <div className="big">{avgMood}</div>
          <div className="lbl">average mood (1–10)</div>
        </div>
        <div className="card stat">
          <div className="big">{daysIn}</div>
          <div className="lbl">days in · {yearPct}% of year one</div>
        </div>
      </div>

      <section className="card">
        <div className="kicker">By Category — Last 7 Days</div>
        {Object.entries(week.byCat).map(([k, v]) => {
          const pct = v.total ? v.done / v.total : 0
          return (
            <div key={k} className="cat-bar">
              <span className="name">{CATEGORIES[k].label}</span>
              <div className="track">
                <div className="fill" style={{ width: `${pct * 100}%`, background: CATEGORIES[k].color }} />
              </div>
              <span className="pct">{Math.round(pct * 100)}%</span>
            </div>
          )
        })}
      </section>

      <section className="card section-gap">
        <div className="kicker">Signal</div>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 350, lineHeight: 1.6 }}>
          {bestDay && bestDay.done > 0
            ? `Best day this week: ${bestDay.date.toLocaleDateString('en-US', { weekday: 'long' })} at ${Math.round(bestDay.pct * 100)}%. Whatever you did that morning — do it again tomorrow.`
            : 'No signal yet. The data starts compounding the moment you log your first completed block.'}
        </p>
      </section>
    </>
  )
}
