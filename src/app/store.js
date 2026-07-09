// Persistent app state — a faithful port of the Figma build's localStorage layer,
// backed by AsyncStorage on device, and (when signed in) mirrored to the cloud.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { pushState as cloudPush } from '../services/cloudSync'
import { syncPublicProfile } from '../services/socialService'

export const STORAGE_KEY = 'roadmap_v1'

export const EMPTY_STATE = { profile: null, dreamRevealSeen: false }

export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (raw) {
      const state = JSON.parse(raw)
      // Legacy rename: the assistant used to be "Coach" (the old hardcoded
      // default); it's now "Nova". Custom names the user chose are left alone.
      if (state?.profile && state.profile.coachName === 'Coach') state.profile.coachName = 'Nova'
      return state
    }
  } catch {}
  return EMPTY_STATE
}

export async function saveState(state) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
  // Local stays the source of truth; mirror up to the cloud when signed in.
  // Debounced + no-ops when there's no userId, so this is safe to call always.
  try {
    cloudPush(state?.profile?.userId, state)
  } catch {}
  // Keep the public profile projection (for friends/discovery) in sync too.
  try {
    if (state?.profile) syncPublicProfile(state.profile)
  } catch {}
}

export async function clearState() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {}
}

// Day keys use LOCAL date components — toISOString() is UTC, which would put an
// evening check-in on tomorrow's date for anyone west of Greenwich.
function dateKeyOf(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function todayKey() {
  return dateKeyOf(new Date())
}
export function yesterdayKey() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dateKeyOf(d)
}

// The user's LIVE streak: consecutive days where all three non-negotiables were
// completed. profile.streak is only trustworthy while the chain is unbroken —
// if the last banked day is neither today nor yesterday, a day was missed and
// the real streak is 0. (Yesterday still counts: today is still in progress.)
export function currentStreak(profile) {
  const last = profile?.lastCheckIn
  if (!last) return 0
  if (last !== todayKey() && last !== yesterdayKey()) return 0
  return profile.streak || 0
}

export function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function nowTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export const REVIEW_INTERVAL_DAYS = 25

// Whole days between two ISO date strings (b defaults to now).
export function daysSince(iso, bIso) {
  if (!iso) return Infinity
  const a = new Date(iso).getTime()
  const b = bIso ? new Date(bIso).getTime() : Date.now()
  return Math.floor((b - a) / 86400000)
}

// Live "day count" for the journey — how many calendar days the user has been on
// NorthStar, counting the join day as Day 1 and ticking up at LOCAL midnight so it
// stays in step with the calendar (not a frozen number). Compared at local-midnight
// boundaries so it never off-by-ones across timezones / DST.
export function daysSinceJoined(profile) {
  const start = profile?.joinedDate
  if (!start) return 1
  const s = new Date(start)
  if (isNaN(s.getTime())) return 1
  const now = new Date()
  const startMid = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime()
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((nowMid - startMid) / 86400000)
  return Math.max(1, days + 1)
}

// Is the long-term goal review due? (25+ days since the last review / join,
// and there's at least one milestone still open to talk about.)
export function reviewDue(profile) {
  if (!profile) return false
  const last = profile.lastLongTermReview || profile.joinedDate
  const hasOpen = (profile.goals || []).some((g) => g.milestones.some((m) => !m.completed))
  return hasOpen && daysSince(last) >= REVIEW_INTERVAL_DAYS
}

// Schema helpers for extended profile structure
export const createGoal = (id, title, category, description = '', isPrimary = false) => ({
  id,
  title,
  category,
  description,
  progress: 0,
  primary_goal: isPrimary,
  milestones: [],
  daily_actions: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

export const createMilestone = (id, goalId, title, horizon, description = '') => ({
  id,
  goal_id: goalId,
  title,
  horizon,
  description,
  completed: false,
  steps: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

export const createStep = (id, milestoneId, title, orderIndex = 0) => ({
  id,
  milestone_id: milestoneId,
  title,
  completed: false,
  order_index: orderIndex,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

export const createDailyAction = (id, goalId, date, title, description = '', orderIndex = 0) => ({
  id,
  goal_id: goalId,
  date,
  title,
  description,
  completed: false,
  order_index: orderIndex,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

// Extended profile schema with new fields
export const extendedProfileSchema = {
  // User identification
  userId: null, // Supabase UUID
  email: '',

  // Social / public profile
  username: '',
  bio: '',
  avatarUrl: null,
  visibility: 'private', // 'private' (friends only) | 'public' (anyone)

  // Existing fields
  name: '',
  coachName: 'Nova',
  coachTone: 'default',
  dreamDescription: '',
  dreamStory: '',
  gender: '',
  age: '',
  location: '',
  joinedDate: new Date().toISOString(),
  lastCheckIn: null,
  streak: 0,

  // New fields for Dream-to-Action system
  goals: [],
  dailyActions: [],
  // Nova's long-term memory: { facts: [{text}], distilledAtCount, updatedAt } —
  // distilled from chats (aiService.distillCoachMemory), synced per user.
  coachMemory: null,

  // Non-negotiables
  nonNeg: {}, // { dateKey: [{ time, title, completed }, ...] }
  lastCheckInDate: null,

  // Sprints
  sprints: [],

  // Session tracking
  lastLongTermReview: null,
  dreamRevealSeen: false,

  // Settings
  autoSyncEnabled: true,
  lastSyncTime: null,

  // API keys (client-side, should be encrypted)
  apiKeys: {
    claude: null,
    dalle: null,
  },
}
