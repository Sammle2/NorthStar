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
    if (raw) return JSON.parse(raw)
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

export function todayKey() {
  return new Date().toISOString().split('T')[0]
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
  coachName: 'Coach',
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
  visionBoardKeywords: [],
  visionBoardImages: [],

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
