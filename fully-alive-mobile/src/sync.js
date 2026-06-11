// Supabase cloud sync — local-first, cloud-backed.
// Every state change is debounced up to the rm_state table; a fresh install
// pulls the latest snapshot back down. Auth upgrade path: swap device_id for user id.
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL = 'https://wsgbnhiklczfiapqrnnf.supabase.co'
const SUPABASE_KEY = 'sb_publishable_YK1olhdXjHYzbdlGABGP4w_37Qp8ROV'
const REST = `${SUPABASE_URL}/rest/v1/rm_state`
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

let deviceId = null
async function getDeviceId() {
  if (deviceId) return deviceId
  deviceId = await AsyncStorage.getItem('rm_device_id')
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).slice(2, 12)
    await AsyncStorage.setItem('rm_device_id', deviceId)
  }
  return deviceId
}

let timer = null
export function pushState(state) {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    try {
      const id = await getDeviceId()
      await fetch(REST, {
        method: 'POST',
        headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ device_id: id, state, updated_at: new Date().toISOString() }),
      })
    } catch {
      // offline is fine — local storage is the source of truth
    }
  }, 2500)
}

export async function pullState() {
  try {
    const id = await getDeviceId()
    const res = await fetch(`${REST}?device_id=eq.${id}&select=state`, { headers: HEADERS })
    const rows = await res.json()
    return rows?.[0]?.state || null
  } catch {
    return null
  }
}
