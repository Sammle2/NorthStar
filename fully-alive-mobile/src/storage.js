import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'fully_alive_v1'

export const DEFAULT_STATE = {
  user: { name: 'Sammy', jarvisPersonality: 'balanced', themeMode: 'dark' },
  intakeDone: false,
  dreamLifeStory: '',
  dreamSeed: 7, // drives the procedural dream-life artwork
  dreams: [], // [{id,title,category,goals:[{id,title,accepted,steps:[{id,title,routine}]}]}]
  tasks: {}, // { 'YYYY-MM-DD': [task] }
  reflections: {}, // { 'YYYY-MM-DD': { mood, note, photo } }
  streaks: {}, // { goalId: { current, best, lastCompletedDate } }
  chat: [],
  startDate: null,
}

export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_STATE }
    return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export async function saveState(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('save failed', e)
  }
}

export function dateKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function uid() {
  return Math.random().toString(36).slice(2, 10)
}
