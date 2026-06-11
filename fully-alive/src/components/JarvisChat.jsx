import { useEffect, useRef, useState } from 'react'
import { getChat, appendChat, getMoods } from '../lib/store.js'
import { allStreaks, dayCompletion } from '../lib/streaks.js'
import { scheduleFor } from '../data/schedule.js'
import { dateKey } from '../lib/time.js'

// Everything Jarvis needs to be contextual, sent with each message.
function buildContext(logs) {
  const now = new Date()
  const today = dateKey(now)
  const dayLog = logs[today] || {}
  const streaks = allStreaks(logs)
  return {
    now: now.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }),
    hour: now.getHours(),
    todayCompletion: dayCompletion(logs, now).pct,
    topStreak: Math.max(0, ...streaks.map((s) => s.current)),
    streaks: Object.fromEntries(streaks.map((s) => [s.label, s.current])),
    schedule: scheduleFor(now).map((a) => ({
      time: a.time,
      name: a.name,
      status: dayLog[a.id]?.status || 'pending',
    })),
    moodToday: getMoods()[today] || null,
  }
}

export default function JarvisChat({ logs }) {
  const [messages, setMessages] = useState(getChat)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  async function send(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    const withUser = appendChat({ role: 'user', text })
    setMessages(withUser)
    setBusy(true)
    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: withUser, context: buildContext(logs) }),
      })
      const data = await res.json()
      setMessages(appendChat({ role: 'assistant', text: data.reply }))
    } catch {
      setMessages(
        appendChat({
          role: 'assistant',
          text: 'I lost the connection — is the Jarvis server running? (`npm run dev` starts both.)',
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="hero" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 38 }}>Check In</h1>
        <p className="sub">Your witness, advisor, and the keeper of the vision.</p>
      </header>

      <section className="card chat">
        <div className="scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <p className="thinking">
              I’m here. Tell me where you are in the day — or where you’re stuck.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role === 'user' ? 'user' : 'jarvis'}`}>
              {m.text}
            </div>
          ))}
          {busy && <p className="thinking">Jarvis is thinking…</p>}
        </div>
        <form onSubmit={send}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What's the one lever today?"
            autoFocus
          />
          <button className="primary" disabled={busy}>
            Send
          </button>
        </form>
      </section>
    </>
  )
}

export { buildContext }
