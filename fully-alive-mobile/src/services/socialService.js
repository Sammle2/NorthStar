// Social service — public profile projection, friend graph, avatar uploads.
//
// The app's private source of truth is the user_state blob (cloudSync.js). This
// service maintains a PUBLIC projection in the `profiles` table (identity + a few
// display fields: dream, streak, current goal) that friends / public viewers can
// read under RLS, and the friendship graph.
import { getSupabaseClient } from './supabaseAuth'

// Derive the headline goal to show on a profile card.
function currentGoalOf(profile) {
  const goals = profile?.goals || []
  if (!goals.length) return null
  const primary = goals.find((g) => g.primary_goal) || goals[0]
  return primary?.title || null
}

// Build the public projection row from the local profile.
export function projectionFromProfile(profile) {
  return {
    id: profile.userId,
    username: profile.username || null,
    full_name: profile.name || null,
    avatar_url: profile.avatarUrl || null,
    bio: profile.bio || null,
    city: profile.location || null,
    visibility: profile.visibility || 'private',
    streak: profile.streak || 0,
    current_goal: currentGoalOf(profile),
    dream: profile.dreamDescription || null,
  }
}

let pushTimer = null
let lastPushedJson = null

// Debounced upsert of the public projection. Safe to call on every save — no-ops
// without a userId, and dedupes when nothing display-relevant changed.
export function syncPublicProfile(profile) {
  if (!profile?.userId) return
  const row = projectionFromProfile(profile)
  const json = JSON.stringify(row)
  if (json === lastPushedJson) return

  clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' })
      if (error) throw error
      lastPushedJson = json
    } catch (e) {
      // Offline / unconfirmed session — projection updates next save.
      console.warn('[Social] profile projection push failed:', e?.message)
    }
  }, 1500)
}

export function resetProfilePushCache() {
  lastPushedJson = null
}

// Immediate upsert (used right after an explicit profile edit).
export async function saveProfileNow(profile) {
  if (!profile?.userId) return { error: 'Not signed in' }
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('profiles').upsert(projectionFromProfile(profile), { onConflict: 'id' })
    if (error) throw error
    lastPushedJson = JSON.stringify(projectionFromProfile(profile))
    return { error: null }
  } catch (e) {
    console.error('[Social] saveProfileNow failed:', e?.message)
    return { error: e?.message || 'Could not save profile' }
  }
}

// Is a username taken by someone else? (case-insensitive)
export async function isUsernameAvailable(username, myId) {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', username.trim())
      .neq('id', myId)
      .limit(1)
    if (error) throw error
    return (data || []).length === 0
  } catch (e) {
    console.warn('[Social] username check failed:', e?.message)
    return true // don't block on a transient check failure
  }
}

// ── Avatars ──
export async function uploadAvatar(userId, uri) {
  try {
    const supabase = getSupabaseClient()
    const res = await fetch(uri)
    const blob = await res.blob()
    const ext = (blob.type && blob.type.split('/')[1]) || 'jpg'
    const path = `${userId}/avatar_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    })
    if (error) throw error
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return { url: data.publicUrl, error: null }
  } catch (e) {
    console.error('[Social] avatar upload failed:', e?.message)
    return { url: null, error: e?.message || 'Upload failed' }
  }
}

// ── Discovery ──
export async function searchProfiles(query) {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.rpc('search_profiles', { q: query })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[Social] search failed:', e?.message)
    return []
  }
}

// Fetch a full profile (RLS-gated). Returns null when hidden (private non-friend).
export async function getProfile(userId) {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    return data || null
  } catch (e) {
    console.warn('[Social] getProfile failed:', e?.message)
    return null
  }
}

// ── Friend graph ──
// All friendship rows that involve me (pending + accepted, in/out).
export async function getFriendships() {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[Social] getFriendships failed:', e?.message)
    return []
  }
}

export async function sendFriendRequest(addresseeId, myId) {
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: myId, addressee_id: addresseeId, status: 'pending' })
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.error('[Social] sendFriendRequest failed:', e?.message)
    return { error: e?.message || 'Could not send request' }
  }
}

export async function acceptFriendRequest(friendshipId) {
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', friendshipId)
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.error('[Social] acceptFriendRequest failed:', e?.message)
    return { error: e?.message || 'Could not accept' }
  }
}

// Decline a request, cancel a sent request, or unfriend — all just delete the row.
export async function removeFriendship(friendshipId) {
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.error('[Social] removeFriendship failed:', e?.message)
    return { error: e?.message || 'Could not update' }
  }
}

// Fetch full profile cards for a set of ids (RLS-gated — private non-friends omitted).
export async function getProfilesByIds(ids) {
  if (!ids?.length) return []
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from('profiles').select('*').in('id', ids)
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[Social] getProfilesByIds failed:', e?.message)
    return []
  }
}

// Identity-only (username/name/avatar) for a set of ids — always visible, so
// requesters and search results are recognizable even when private.
export async function getIdentities(ids) {
  if (!ids?.length) return []
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.rpc('get_identities', { ids })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[Social] getIdentities failed:', e?.message)
    return []
  }
}

export default {
  projectionFromProfile,
  syncPublicProfile,
  resetProfilePushCache,
  saveProfileNow,
  isUsernameAvailable,
  uploadAvatar,
  searchProfiles,
  getProfile,
  getFriendships,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  getProfilesByIds,
  getIdentities,
}
