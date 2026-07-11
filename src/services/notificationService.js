// Notification service — daily check-ins + one-off motivations.
//
// Platform-aware:
//  - NATIVE (iOS/Android): expo-notifications. The daily 1 PM check-in is a real
//    OS-scheduled LOCAL notification that fires even when the app is closed — no
//    server or APNs certificate needed. One-off motivations present immediately.
//  - WEB: the browser Notification API (with permission) + an in-app banner.
//  - Everywhere: also emits to in-app listeners so the app can show its own
//    banner while open.
//
// Remote (server-sent) push — e.g. "a friend messaged you" — needs an Expo push
// token registered to a backend that sends via the Expo Push API (and, for iOS,
// an Apple push key from a paid Apple Developer account). registerForPushToken()
// below fetches the token so that layer is a small follow-up, not a rewrite.
import { Platform } from 'react-native'

// Lazy native-only requires so the web bundle never touches native modules.
const Notifications = Platform.OS !== 'web' ? require('expo-notifications') : null
const Device = Platform.OS !== 'web' ? require('expo-device') : null

const CHECKIN_ID = 'daily-checkin' // stable identifier so we replace, not stack
const ANDROID_CHANNEL = 'reminders'

// Foreground behaviour on native: show the banner + play sound even while open.
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  })
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android' || !Notifications) return
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#f59e0b',
    })
  } catch (e) { /* noop */ }
}

// ── Web Notification API ──────────────────────────────────────────────────────
export function webNotificationsSupported() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window
}

export function permissionStatus() {
  if (!webNotificationsSupported()) return 'unsupported'
  try { return Notification.permission } catch { return 'unsupported' }
}

// Ask for OS notification permission (native) or browser permission (web).
export async function requestNotificationPermission() {
  if (Notifications) {
    try {
      await ensureAndroidChannel()
      const current = await Notifications.getPermissionsAsync()
      if (current.granted) return 'granted'
      const req = await Notifications.requestPermissionsAsync()
      return req.granted ? 'granted' : 'denied'
    } catch { return 'denied' }
  }
  if (!webNotificationsSupported()) return 'unsupported'
  try {
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied') return 'denied'
    return await Notification.requestPermission()
  } catch { return 'denied' }
}

// ── In-app pub/sub (for the top banner while the app is open) ─────────────────
const listeners = new Set()
export function onNotification(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit(payload) {
  listeners.forEach((fn) => { try { fn(payload) } catch (e) { /* noop */ } })
}

// Fire a notification NOW: OS notification (web if granted / native immediate) +
// in-app banner.
export function notify(title, body, kind = 'checkin') {
  if (webNotificationsSupported() && Notification.permission === 'granted') {
    try { new Notification(title, { body }) } catch (e) { /* noop */ }
  } else if (Notifications) {
    try { Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }) } catch (e) { /* noop */ }
  }
  emit({ title, body, kind, at: new Date().toISOString() })
  return { title, body, kind }
}

// ── Daily check-in scheduler ──────────────────────────────────────────────────
let webCheckInTimer = null

// ms until the next occurrence of hh:mm in LOCAL time (web scheduler).
function msUntilNext(hh, mm = 0) {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

// Schedule the daily "quick check" at 1:00 PM local. getMessage() returns
// { title, body }. On WEB the timer fires while the tab is open and re-arms each
// day (getMessage runs at fire time, so it reflects the live streak/tone). On
// NATIVE it's a real repeating OS notification — the message is resolved ONCE at
// schedule time (JS isn't running when the app is closed) and refreshed whenever
// this is re-armed (app open, tone/streak change).
export function scheduleDailyCheckIn(getMessage, hh = 13, mm = 0) {
  const resolve = () => { try { return getMessage?.() || {} } catch { return {} } }

  if (Notifications) {
    ;(async () => {
      try {
        await ensureAndroidChannel()
        await cancelDailyCheckIn()
        const msg = resolve()
        await Notifications.scheduleNotificationAsync({
          identifier: CHECKIN_ID,
          content: {
            title: msg.title || 'Nova',
            body: msg.body || 'Quick check-in — how’s today going?',
          },
          // SDK 56 requires the explicit typed trigger; DAILY repeats at hh:mm local.
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: hh,
            minute: mm,
            ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
          },
        })
      } catch (e) { /* noop */ }
    })()
    return
  }

  // Web: setTimeout to the next 1pm, re-arm each day.
  cancelDailyCheckIn()
  const arm = () => {
    webCheckInTimer = setTimeout(() => {
      const msg = resolve()
      notify(msg.title || 'Nova', msg.body || 'Quick check-in — how’s today going?', 'checkin')
      arm()
    }, msUntilNext(hh, mm))
  }
  arm()
}

export async function cancelDailyCheckIn() {
  if (Notifications) {
    try { await Notifications.cancelScheduledNotificationAsync(CHECKIN_ID) } catch (e) { /* noop */ }
    return
  }
  if (webCheckInTimer) { clearTimeout(webCheckInTimer); webCheckInTimer = null }
}

// ── Remote push token (groundwork; used once a sending backend + APNs key exist) ─
// Returns the Expo push token string, or null if unavailable/denied/web/simulator.
export async function registerForPushToken() {
  if (!Notifications || !Device?.isDevice) return null
  try {
    const perm = await requestNotificationPermission()
    if (perm !== 'granted') return null
    const { data } = await Notifications.getExpoPushTokenAsync()
    return data || null
  } catch { return null }
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
  registerForPushToken,
  sendMotivation,
}
