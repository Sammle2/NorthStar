// Cloud sync — user-scoped, local-first, cloud-backed.
//
// The whole app profile is stored as one JSONB blob in `user_state`, keyed by
// the authenticated user's id (RLS: a user can only touch their own row). Local
// AsyncStorage stays the source of truth; this pushes a debounced snapshot up and
// pulls the latest down on a fresh device.
//
// We use the supabase-js client (not raw REST) because it carries the signed-in
// user's JWT, which is what makes `auth.uid() = user_id` RLS resolve.
import { getSupabaseClient } from './supabaseAuth'

let pushTimer = null
let lastPushedJson = null

// Debounced push of the full state blob for a user. Safe to call on every save.
export function pushState(userId, state) {
  if (!userId) return // not signed in — local-only

  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    flushState(userId, state).catch((e) => {
      // Offline / transient — local storage remains the source of truth.
      console.warn('[CloudSync] push failed (will retry on next save):', e?.message)
    })
  }, 2000)
}

// Immediate push (used on sign-out / app-background). Returns success boolean.
export async function flushState(userId, state) {
  if (!userId) return false

  const json = JSON.stringify(state)
  if (json === lastPushedJson) return true // nothing changed since last push

  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('user_state')
    .upsert(
      { user_id: userId, state, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )

  if (error) throw new Error(error.message)
  lastPushedJson = json
  return true
}

// Pull the latest cloud snapshot for a user. Returns the state object or null
// (null = no cloud row yet, or offline).
export async function pullState(userId) {
  if (!userId) return null

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('user_state')
      .select('state, updated_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data ? { state: data.state, updatedAt: data.updated_at } : null
  } catch (e) {
    console.warn('[CloudSync] pull failed:', e?.message)
    return null
  }
}

// Reset the dedupe cache (e.g. after sign-out) so the next user's first save pushes.
export function resetPushCache() {
  lastPushedJson = null
}

export default { pushState, flushState, pullState, resetPushCache }
