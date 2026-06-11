// localStorage-backed store. One key per concern, JSON values.
// logs:  { "YYYY-MM-DD": { [activityId]: { status: 'done'|'skipped', note, ts } } }
// moods: { "YYYY-MM-DD": 1-10 }
// chat:  [{ role: 'user'|'assistant', text, ts }]

const KEYS = { logs: 'fa_logs', moods: 'fa_moods', chat: 'fa_chat', profile: 'fa_profile' }

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export const DEFAULT_PROFILE = {
  name: 'Sammy',
  partner: 'Christina',
  startDate: '2026-06-10',
}

export function getProfile() {
  return { ...DEFAULT_PROFILE, ...read(KEYS.profile, {}) }
}

export function getLogs() {
  return read(KEYS.logs, {})
}

export function setLog(dayKey, activityId, entry) {
  const logs = getLogs()
  const day = { ...(logs[dayKey] || {}) }
  if (entry === null) delete day[activityId]
  else day[activityId] = { ...entry, ts: new Date().toISOString() }
  write(KEYS.logs, { ...logs, [dayKey]: day })
}

export function getMoods() {
  return read(KEYS.moods, {})
}

export function setMood(dayKey, rating) {
  write(KEYS.moods, { ...getMoods(), [dayKey]: rating })
}

export function getChat() {
  return read(KEYS.chat, [])
}

export function appendChat(message) {
  const chat = [...getChat(), { ...message, ts: new Date().toISOString() }]
  write(KEYS.chat, chat.slice(-200)) // keep history bounded
  return chat
}
