import { useMemo } from 'react'
import { allStreaks, heatmap } from '../lib/streaks.js'

const BADGES = [
  { days: 7, icon: '🔥', label: '7-day fire' },
  { days: 30, icon: '🚀', label: '30-day liftoff' },
  { days: 100, icon: '💎', label: '100-day diamond' },
  { days: 365, icon: '👑', label: 'Annual crown' },
]

function heatColor(pct) {
  if (pct === 0) return 'var(--line)'
  if (pct < 0.4) return 'rgba(232, 160, 92, 0.25)'
  if (pct < 0.7) return 'rgba(232, 160, 92, 0.5)'
  if (pct < 1) return 'rgba(232, 160, 92, 0.75)'
  return 'var(--ember)'
}

export default function StreaksView({ logs }) {
  const streaks = useMemo(() => allStreaks(logs), [logs])
  const cells = useMemo(() => heatmap(logs, 84), [logs])
  const top = Math.max(0, ...streaks.map((s) => s.current))
  const activeCount = streaks.filter((s) => s.current >= 1).length
  const onFire = streaks.filter((s) => s.current >= 3).length >= 3

  return (
    <>
      <header className="hero" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 38 }}>The Chains</h1>
        <p className="sub">
          {onFire
            ? 'On fire — three streaks burning at once. Don’t look down.'
            : activeCount > 0
              ? `${activeCount} of 6 chains alive. Protect them tonight.`
              : 'Every chain starts with one link. Forge it today.'}
        </p>
      </header>

      <div className="streak-grid">
        {streaks.map((s) => (
          <div key={s.key} className="card streak-card">
            <div className={`num ${s.current === 0 ? 'zero' : ''}`}>
              {s.current}
              {s.current >= 3 && <span className="flame">🔥</span>}
            </div>
            <div className="label">{s.label}</div>
            <div className="sub">{s.sub}</div>
            <div className="best">
              Best: {s.best} {s.best === 1 ? 'day' : 'days'}
              {top >= 1 && s.current === top && s.current > 0 ? ' · your strongest chain' : ''}
            </div>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="kicker">Last 12 Weeks</div>
        <div className="heat">
          {cells.map((c) => (
            <div
              key={c.key}
              className="cell"
              title={`${c.key} — ${c.done}/${c.total} completed`}
              style={{ background: heatColor(c.pct) }}
            />
          ))}
        </div>
        <div className="badges">
          {BADGES.map((b) => (
            <span key={b.days} className={`badge ${top >= b.days ? 'earned' : ''}`}>
              {b.icon} {b.label}
            </span>
          ))}
          <span className={`badge ${onFire ? 'earned' : ''}`}>⚡ On fire — 3+ streaks</span>
        </div>
        {top > 0 && top < 100 && (
          <p style={{ marginTop: 16, fontSize: 13, color: 'var(--ink-dim)' }}>
            {100 - top} days to the diamond.
          </p>
        )}
      </section>
    </>
  )
}
