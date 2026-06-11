// The Ascension Blueprint — Sammy's weekly architecture.
// `nn` ties an activity to a non-negotiable streak. Times are 24h "HH:MM".

export const CATEGORIES = {
  movement: { label: 'Movement', color: 'var(--c-movement)' },
  inner: { label: 'Inner Work', color: 'var(--c-inner)' },
  business: { label: 'Business', color: 'var(--c-business)' },
  christina: { label: 'Christina', color: 'var(--c-christina)' },
  learning: { label: 'Learning', color: 'var(--c-learning)' },
  rest: { label: 'Rest', color: 'var(--c-rest)' },
}

export const NON_NEGOTIABLES = [
  { key: 'movement', label: 'Morning Movement', sub: '45 min, before the world wakes' },
  { key: 'inner', label: 'Inner Work', sub: '60 min — journal, prayer, identity' },
  { key: 'deep', label: 'Deep Work', sub: '6 hours on the business' },
  { key: 'christina', label: 'Christina Time', sub: '2 hours, phone down' },
  { key: 'sleep', label: 'Sleep', sub: '7+ hours, lights out by 10' },
  { key: 'learning', label: 'Learning', sub: '30 min — books, not feeds' },
]

const weekday = [
  { id: 'rise', time: '05:45', dur: 15, category: 'rest', name: 'Rise', purpose: 'Feet on the floor. No phone. Water, light, intent.' },
  { id: 'movement', time: '06:00', dur: 45, category: 'movement', nn: 'movement', name: 'Run', purpose: 'Clarity setting, physical dominance, reset nervous system.' },
  { id: 'inner', time: '07:00', dur: 60, category: 'inner', nn: 'inner', name: 'Inner Work', purpose: 'Journal, prayer, identity work. Become before you build.' },
  { id: 'deep1', time: '08:30', dur: 180, category: 'business', nn: 'deep', name: 'Deep Work I', purpose: 'One lever. Client work, systems, the book. No inbox.' },
  { id: 'lunch', time: '11:30', dur: 45, category: 'rest', name: 'Refuel', purpose: 'Real food. Walk if the morning was heavy.' },
  { id: 'deep2', time: '12:15', dur: 180, category: 'business', nn: 'deep', name: 'Deep Work II', purpose: 'Meetings, follow-ups, pipeline. Build what runs without you.' },
  { id: 'admin', time: '15:30', dur: 60, category: 'business', name: 'Close the Loops', purpose: 'Inbox zero, notes, tomorrow’s one lever named.' },
  { id: 'learning', time: '17:00', dur: 30, category: 'learning', nn: 'learning', name: 'Learning', purpose: '30 pages or 30 minutes. Input that compounds.' },
  { id: 'dinner', time: '18:00', dur: 60, category: 'rest', name: 'Dinner', purpose: 'Slow down. Transition out of builder mode.' },
  { id: 'christina', time: '20:00', dur: 120, category: 'christina', nn: 'christina', name: 'Christina Time', purpose: 'Phone down. Eyes up. This hour compounds the marriage.' },
  { id: 'sleep', time: '22:00', dur: 0, category: 'rest', nn: 'sleep', name: 'Lights Out', purpose: '7+ hours. Recovery is the multiplier on everything above.' },
]

const saturday = [
  { id: 'rise', time: '06:30', dur: 15, category: 'rest', name: 'Rise', purpose: 'Slower start. Still before the world.' },
  { id: 'movement', time: '07:00', dur: 60, category: 'movement', nn: 'movement', name: 'Long Run / Lift', purpose: 'The weekly capstone effort.' },
  { id: 'inner', time: '08:15', dur: 60, category: 'inner', nn: 'inner', name: 'Inner Work', purpose: 'Longer journal. Review the week against the vision.' },
  { id: 'deep1', time: '09:30', dur: 120, category: 'business', nn: 'deep', name: 'Book Block', purpose: 'The testimony. Pages, not perfection.' },
  { id: 'christina', time: '12:00', dur: 240, category: 'christina', nn: 'christina', name: 'Adventure with Christina', purpose: 'Date day. Make memories, not plans.' },
  { id: 'learning', time: '17:00', dur: 30, category: 'learning', nn: 'learning', name: 'Learning', purpose: 'Read. Let the week’s lessons settle.' },
  { id: 'sleep', time: '22:30', dur: 0, category: 'rest', nn: 'sleep', name: 'Lights Out', purpose: 'Protect the morning by closing the night.' },
]

const sunday = [
  { id: 'rise', time: '06:30', dur: 15, category: 'rest', name: 'Rise', purpose: 'Sabbath pace.' },
  { id: 'movement', time: '07:00', dur: 45, category: 'movement', nn: 'movement', name: 'Walk / Mobility', purpose: 'Active recovery. Move, don’t grind.' },
  { id: 'inner', time: '08:00', dur: 90, category: 'inner', nn: 'inner', name: 'Church + Reflection', purpose: 'Anchor the why. Gratitude before ambition.' },
  { id: 'christina', time: '10:00', dur: 120, category: 'christina', nn: 'christina', name: 'Slow Morning with Christina', purpose: 'Coffee, conversation, zero agenda.' },
  { id: 'review', time: '17:00', dur: 60, category: 'inner', name: 'Weekly Review', purpose: 'Score the week. Name the wins. Set Monday’s lever.' },
  { id: 'learning', time: '18:30', dur: 30, category: 'learning', nn: 'learning', name: 'Learning', purpose: 'Feed the mind before the week feeds on you.' },
  { id: 'sleep', time: '21:30', dur: 0, category: 'rest', nn: 'sleep', name: 'Lights Out', purpose: 'Early night. Monday is won on Sunday.' },
]

// Index 0 = Sunday, matching Date.getDay()
export const WEEK = [sunday, weekday, weekday, weekday, weekday, weekday, saturday]

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function scheduleFor(date) {
  return WEEK[date.getDay()]
}
