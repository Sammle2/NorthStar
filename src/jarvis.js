import { Platform } from 'react-native'
import { dateKey } from './storage'
import { topStreak, weekContext } from './logic'

// On web the Coach server is same-machine; on device, set your Mac's LAN IP.
const HOST = Platform.OS === 'web' ? 'http://localhost:8787' : 'http://192.168.1.100:8787'

export function buildContext(state) {
  const now = new Date()
  const today = state.tasks[dateKey()] || []
  return {
    now: now.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }),
    hour: now.getHours(),
    name: state.user.name,
    topStreak: topStreak(state.streaks),
    completedToday: today.filter((t) => t.completed).length,
    todayTasks: today.map((t) => ({
      title: t.title,
      priority: t.priority,
      status: t.completed ? 'done' : t.skipped ? 'skipped' : 'pending',
    })),
    dreams: state.dreams.map((d) => ({
      title: d.title,
      goals: d.goals.filter((g) => g.accepted).map((g) => g.title),
    })),
    moodToday: state.reflections[dateKey()]?.mood || null,
    week: weekContext(state),
  }
}

async function post(path, body) {
  const res = await fetch(`${HOST}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function chat(state, messages) {
  try {
    const data = await post('/api/jarvis', {
      messages,
      context: buildContext(state),
      personality: state.user.jarvisPersonality,
    })
    return data.reply
  } catch {
    return offlineLine(state)
  }
}

export async function intake(answers, extra) {
  try {
    return await post('/api/intake', { answers, extra })
  } catch {
    return null // caller falls back to its own local generator
  }
}

// Gemini-generated dream-life image (data URI), or null if unavailable.
export async function dreamImage(narrative, dreams) {
  try {
    const data = await post('/api/dream-image', { narrative, dreams })
    return data.image || null
  } catch {
    return null
  }
}

export async function weekly(state) {
  try {
    const data = await post('/api/weekly', {
      context: weekContext(state),
      personality: state.user.jarvisPersonality,
    })
    return data.reply
  } catch {
    return 'I couldn’t reach the Coach server. Start it with `npm run server` inside fully-alive/ and I’ll write your weekly summary.'
  }
}

function offlineLine(state) {
  const h = new Date().getHours()
  const streak = topStreak(state.streaks)
  if (h < 10) return streak > 0 ? `${streak} days strong. First task — go win it.` : 'Day one. Make the first promise and keep it.'
  if (h < 17) return 'Midday check: one high-priority task, started in the next ten minutes.'
  return 'Evening: log the day honestly. Tomorrow starts clean.'
}
