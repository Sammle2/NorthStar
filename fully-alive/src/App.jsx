import { useCallback, useEffect, useState } from 'react'
import Dashboard from './components/Dashboard.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import StreaksView from './components/StreaksView.jsx'
import JarvisChat, { buildContext } from './components/JarvisChat.jsx'
import MetricsView from './components/MetricsView.jsx'
import { getLogs, setLog } from './lib/store.js'

const TABS = [
  { id: 'home', label: 'Today' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'streaks', label: 'Streaks' },
  { id: 'jarvis', label: 'Jarvis' },
  { id: 'metrics', label: 'Becoming' },
]

export default function App() {
  const [tab, setTab] = useState('home')
  const [logs, setLogs] = useState(getLogs)
  const [jarvisLine, setJarvisLine] = useState('Reading the day…')

  // Toggle done / set an explicit entry (skip with reason) / clear.
  const onToggle = useCallback((dayKey, activityId, entry, explicit) => {
    if (explicit !== undefined) setLog(dayKey, activityId, explicit)
    else if (entry?.status === 'done') setLog(dayKey, activityId, null)
    else setLog(dayKey, activityId, { status: 'done' })
    setLogs(getLogs())
  }, [])

  // One contextual Jarvis line for the dashboard card, refreshed on load.
  useEffect(() => {
    let cancelled = false
    fetch('/api/jarvis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', text: 'Give me my one-line check-in for right now.' }],
        context: buildContext(getLogs()),
      }),
    })
      .then((r) => r.json())
      .then((d) => !cancelled && setJarvisLine(d.reply))
      .catch(() => !cancelled && setJarvisLine('The narrow path doesn’t need motivation — it needs your next 45 minutes. Start the server (`npm run dev`) and I’ll meet you there.'))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="app">
      <nav className="nav">
        <span className="wordmark">
          Fully Alive<span className="dot">.</span>
        </span>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'home' && (
        <Dashboard logs={logs} onToggle={onToggle} onNavigate={setTab} jarvisLine={jarvisLine} />
      )}
      {tab === 'schedule' && <ScheduleView logs={logs} onToggle={onToggle} />}
      {tab === 'streaks' && <StreaksView logs={logs} />}
      {tab === 'jarvis' && <JarvisChat logs={logs} />}
      {tab === 'metrics' && <MetricsView logs={logs} />}
    </div>
  )
}
