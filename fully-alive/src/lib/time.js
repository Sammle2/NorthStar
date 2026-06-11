export function dateKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function minutesOfDay(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes()
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return m === 0 ? `${hr} ${ampm}` : `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

export function daysAgo(n, from = new Date()) {
  const d = new Date(from)
  d.setDate(d.getDate() - n)
  return d
}

export function greeting(now = new Date(), streak = 0) {
  const h = now.getHours()
  if (h < 9) return { title: 'Rise.', line: 'Your future self is waiting.' }
  if (h < 12) return { title: 'Morning won.', line: 'Now stack the day on top of it.' }
  if (h < 17) return { title: 'Building momentum.', line: streak > 0 ? `${streak} days of proof behind you.` : 'One block at a time.' }
  if (h < 20) return { title: 'Land the day.', line: 'Finish what the morning started.' }
  return { title: 'How was the becoming today?', line: 'Close the loops. Protect the night.' }
}
