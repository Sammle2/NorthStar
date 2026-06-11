import { useMemo, useState } from 'react'
import { CATEGORIES, scheduleFor } from '../data/schedule.js'
import { dateKey, minutesOfDay, toMinutes, fmtTime, greeting } from '../lib/time.js'
import { allStreaks, dayCompletion } from '../lib/streaks.js'
import { getProfile, getMoods, setMood } from '../lib/store.js'

export default function Dashboard({ logs, onToggle, onNavigate, jarvisLine }) {
  const now = new Date()
  const today = dateKey(now)
  const profile = getProfile()
  const [mood, setMoodState] = useState(getMoods()[today] || 0)

  const schedule = scheduleFor(now)
  const dayLog = logs[today] || {}
  const completion = dayCompletion(logs, now)
  const streaks = useMemo(() => allStreaks(logs), [logs])
  const topStreak = Math.max(0, ...streaks.map((s) => s.current))
  const greet = greeting(now, topStreak)

  const daysIn =
    Math.floor((now - new Date(profile.startDate + 'T00:00:00')) / 86400000) + 1

  // Current + next items relative to the clock; fall back to first unfinished.
  const nowMin = minutesOfDay(now)
  const upcoming = useMemo(() => {
    const idx = schedule.findIndex(
      (a) => toMinutes(a.time) + Math.max(a.dur, 30) > nowMin,
    )
    const start = idx === -1 ? Math.max(schedule.length - 3, 0) : idx
    return schedule.slice(start, start + 3)
  }, [schedule, nowMin])

  const rateMood = (n) => {
    setMood(today, n)
    setMoodState(n)
  }

  return (
    <>
      <header className="hero">
        <h1>{greet.title}</h1>
        <p className="sub">{greet.line}</p>
        <div className="meta">
          <span>
            Day <strong>{daysIn}</strong> of the becoming
          </span>
          <span>
            <span className="flame">●</span> Top streak <strong>{topStreak}</strong> days
          </span>
          <span>
            Today <strong>{Math.round(completion.pct * 100)}%</strong> complete
          </span>
        </div>
      </header>

      <div className="grid">
        <section className="card">
          <div className="kicker">Today’s Snapshot</div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${completion.pct * 100}%` }} />
          </div>
          {upcoming.map((a) => {
            const entry = dayLog[a.id]
            return (
              <div key={a.id} className={`now-item ${entry?.status === 'done' ? 'done' : ''}`}>
                <span className="bar" style={{ background: CATEGORIES[a.category].color }} />
                <span className="t">{fmtTime(a.time)}</span>
                <div className="grow">
                  <div className="name">{a.name}</div>
                  <div className="purpose">{a.purpose}</div>
                </div>
                <button
                  className={`check ${entry?.status === 'done' ? 'on' : entry?.status === 'skipped' ? 'skipped' : ''}`}
                  title={entry?.status === 'done' ? 'Completed — click to undo' : 'Mark complete'}
                  onClick={() => onToggle(today, a.id, entry)}
                >
                  {entry?.status === 'skipped' ? '–' : '✓'}
                </button>
              </div>
            )
          })}
          <div className="jarvis-card card section-gap" style={{ padding: 20 }}>
            <div className="kicker" style={{ color: 'var(--ember)' }}>Jarvis</div>
            <p className="msg">{jarvisLine}</p>
            <div className="actions">
              <button className="primary" onClick={() => onNavigate('jarvis')}>
                Check in
              </button>
              <button className="ghost" onClick={() => onNavigate('schedule')}>
                Full schedule
              </button>
            </div>
          </div>
        </section>

        <section>
          <div className="card">
            <div className="kicker">How are you doing?</div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-dim)' }}>
              One honest number. Jarvis reads the trend.
            </p>
            <div className="mood-row">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} className={mood === n ? 'on' : ''} onClick={() => rateMood(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="card section-gap">
            <div className="kicker">Non-Negotiables</div>
            {streaks.map((s) => (
              <div key={s.key} className="now-item">
                <span
                  className="bar"
                  style={{
                    background:
                      s.current > 0 ? 'var(--ember)' : 'var(--line-strong)',
                  }}
                />
                <div className="grow">
                  <div className="name" style={{ fontSize: 14 }}>{s.label}</div>
                </div>
                <strong style={{ fontVariantNumeric: 'tabular-nums', color: s.current > 0 ? 'var(--ink)' : 'var(--ink-faint)' }}>
                  {s.current}d
                </strong>
              </div>
            ))}
            <button className="ghost section-gap" style={{ width: '100%' }} onClick={() => onNavigate('streaks')}>
              View streaks →
            </button>
          </div>
        </section>
      </div>
    </>
  )
}
