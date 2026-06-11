import { useState } from 'react'
import { CATEGORIES, WEEK, DAY_NAMES } from '../data/schedule.js'
import { dateKey, fmtTime, daysAgo } from '../lib/time.js'

// Map a weekday index (0=Sun) to the actual date in the current week.
function dateForDow(dow) {
  const now = new Date()
  return daysAgo(now.getDay() - dow)
}

export default function ScheduleView({ logs, onToggle }) {
  const todayDow = new Date().getDay()
  const [selected, setSelected] = useState(todayDow)
  const [filter, setFilter] = useState(null)

  const date = dateForDow(selected)
  const key = dateKey(date)
  const dayLog = logs[key] || {}
  const activities = WEEK[selected].filter((a) => !filter || a.category === filter)

  return (
    <>
      <header className="hero" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 38 }}>The Blueprint</h1>
        <p className="sub">Architecture over motivation. The week, already decided.</p>
      </header>

      <div className="week-grid">
        {WEEK.map((day, dow) => (
          <div
            key={dow}
            className={`day-col ${dow === todayDow ? 'today' : ''}`}
            onClick={() => setSelected(dow)}
            style={dow === selected ? { background: 'var(--bg-hover)' } : undefined}
          >
            <h4>{DAY_NAMES[dow].slice(0, 3)}</h4>
            {day.map((a) => (
              <div
                key={a.id}
                className="block"
                style={{
                  background: CATEGORIES[a.category].color,
                  opacity:
                    (logs[dateKey(dateForDow(dow))] || {})[a.id]?.status === 'done' ? 0.35 : 0.9,
                }}
              >
                {fmtTime(a.time)} {a.name}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="filters">
        <button className={!filter ? 'on' : ''} onClick={() => setFilter(null)}>
          All
        </button>
        {Object.entries(CATEGORIES).map(([k, c]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {c.label}
          </button>
        ))}
      </div>

      <section className="card day-detail">
        <div className="kicker">
          {DAY_NAMES[selected]} · {key}
        </div>
        {activities.map((a) => {
          const entry = dayLog[a.id]
          return (
            <div key={a.id} className={`now-item ${entry?.status === 'done' ? 'done' : ''}`}>
              <span className="bar" style={{ background: CATEGORIES[a.category].color }} />
              <span className="t">{fmtTime(a.time)}</span>
              <div className="grow">
                <div className="name">
                  {a.name}
                  {a.dur > 0 && (
                    <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}> · {a.dur} min</span>
                  )}
                </div>
                <div className="purpose">{a.purpose}</div>
                {entry?.status === 'skipped' && entry.note && (
                  <div className="purpose" style={{ color: 'var(--c-christina)' }}>
                    Skipped — {entry.note}
                  </div>
                )}
              </div>
              <button
                className="ghost"
                style={{ padding: '6px 10px', fontSize: 12 }}
                onClick={() => {
                  const note = entry?.status === 'skipped' ? null : prompt('Why are you skipping this?') || 'no reason given'
                  onToggle(key, a.id, entry, note === null ? undefined : { status: 'skipped', note })
                }}
              >
                {entry?.status === 'skipped' ? 'unskip' : 'skip'}
              </button>
              <button
                className={`check ${entry?.status === 'done' ? 'on' : ''}`}
                onClick={() => onToggle(key, a.id, entry)}
              >
                ✓
              </button>
            </div>
          )
        })}
      </section>
    </>
  )
}
