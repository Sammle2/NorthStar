// Notification service — check-ins + motivations.
//
// Per the current build target this is the WEB + IN-APP implementation:
//  - On web it uses the browser Notification API (with permission).
//  - Everywhere it also emits to in-app listeners so the app can show its own
//    banner (works in the preview, and on native until expo-notifications is wired).
//
// Scheduling here fires while the app/tab is open (a setTimeout to the next 1pm,
// re-armed each day). True background/OS-scheduled delivery needs native
// expo-notifications (a real device / dev build) and is intentionally deferred.
import { Platform } from 'react-native'

// ── Web Notification API ──────────────────────────────────────────────────────
export function webNotificationsSupported() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window
}

export function permissionStatus() {
  if (!webNotificationsSupported()) return 'unsupported'
  try { return Notification.permission } catch { return 'unsupported' }
}

export async function requestNotificationPermission() {
  if (!webNotificationsSupported()) return 'unsupported'
  try {
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied') return 'denied'
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

// ── In-app pub/sub (for the top banner + native fallback) ─────────────────────
const listeners = new Set()
export function onNotification(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit(payload) {
  listeners.forEach((fn) => { try { fn(payload) } catch (e) { /* noop */ } })
}

// Fire a notification now: OS notification on web (if granted) + in-app banner.
export function notify(title, body, kind = 'checkin') {
  if (webNotificationsSupported() && Notification.permission === 'granted') {
    try { new Notification(title, { body }) } catch (e) { /* noop */ }
  }
  emit({ title, body, kind, at: new Date().toISOString() })
  return { title, body, kind }
}

// ── Daily 1pm check-in scheduler ──────────────────────────────────────────────
let checkInTimer = null

// ms until the next occurrence of hh:mm in LOCAL time.
function msUntilNext(hh, mm = 0) {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

// Schedule the daily "quick check" at 1:00 PM. getMessage() returns { title, body }
// so the text can stay current with the user's tone/streak at fire time.
export function scheduleDailyCheckIn(getMessage, hh = 13, mm = 0) {
  cancelDailyCheckIn()
  const arm = () => {
    checkInTimer = setTimeout(() => {
      try {
        const msg = getMessage?.() || {}
        notify(msg.title || 'Nova', msg.body || 'Quick check-in — how’s today going?', 'checkin')
      } catch (e) { /* noop */ }
      arm() // re-arm for the next day
    }, msUntilNext(hh, mm))
  }
  arm()
}

export function cancelDailyCheckIn() {
  if (checkInTimer) { clearTimeout(checkInTimer); checkInTimer = null }
}

// Convenience for a one-off motivation push (used by NOVA / progress events).
export function sendMotivation(body, title = 'Nova') {
  return notify(title, body, 'motivation')
}

// Dev-only hook: lets tooling fire a test notification from the browser console.
if (__DEV__ && Platform.OS === 'web' && typeof window !== 'undefined') {
  window.__nsNotify = notify
}

export default {
  webNotificationsSupported,
  permissionStatus,
  requestNotificationPermission,
  onNotification,
  notify,
  scheduleDailyCheckIn,
  cancelDailyCheckIn,
  sendMotivation,
}
