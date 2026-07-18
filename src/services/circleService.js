// Circles — Oura-style groups whose members share their daily stats (streak,
// whether they hit it today, and % to dream). Backed by the circles /
// circle_members tables and gated SECURITY DEFINER RPCs (see the
// 20260712010000_circles migration). Members can see each other's stats even if
// they aren't friends. Joining is by a shareable CODE or an INVITE from a member.
import { getSupabaseClient } from './supabaseAuth'

const one = (data) => (Array.isArray(data) ? data[0] : data)

export async function createCircle(name, { comparisonMode, trackableType } = {}) {
  try {
    // comparison_mode/trackable_type are defaulted server-side, so passing just a
    // name still yields a cooperative/habit circle (backward compatible).
    const params = { p_name: name }
    if (comparisonMode) params.p_comparison_mode = comparisonMode
    if (trackableType) params.p_trackable_type = trackableType
    const { data, error } = await getSupabaseClient().rpc('create_circle', params)
    if (error) throw error
    return { circle: one(data), error: null }
  } catch (e) {
    console.error('[Circles] create failed:', e?.message)
    return { circle: null, error: e?.message || 'Could not create the circle' }
  }
}

export async function joinByCode(code) {
  try {
    const { data, error } = await getSupabaseClient().rpc('join_circle', { p_code: code })
    if (error) throw error
    return { circle: one(data), error: null }
  } catch (e) {
    console.error('[Circles] join failed:', e?.message)
    return { circle: null, error: /No circle found/i.test(e?.message || '') ? "That code didn't match any circle." : (e?.message || 'Could not join') }
  }
}

export async function inviteToCircle(circleId, userId) {
  try {
    const { error } = await getSupabaseClient().rpc('invite_to_circle', { p_circle: circleId, p_user: userId })
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.warn('[Circles] invite failed:', e?.message)
    return { error: e?.message || 'Could not invite' }
  }
}

export async function respondInvite(circleId, accept) {
  try {
    const { error } = await getSupabaseClient().rpc('respond_invite', { p_circle: circleId, p_accept: accept })
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.warn('[Circles] respondInvite failed:', e?.message)
    return { error: e?.message || 'Could not update' }
  }
}

export async function leaveCircle(circleId) {
  try {
    const { error } = await getSupabaseClient().rpc('leave_circle', { p_circle: circleId })
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.warn('[Circles] leave failed:', e?.message)
    return { error: e?.message || 'Could not leave' }
  }
}

export async function getMyCircles() {
  try {
    const { data, error } = await getSupabaseClient().rpc('my_circles')
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[Circles] getMyCircles failed:', e?.message)
    return []
  }
}

export async function getMyInvites() {
  try {
    const { data, error } = await getSupabaseClient().rpc('my_circle_invites')
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[Circles] getMyInvites failed:', e?.message)
    return []
  }
}

export async function getCircleMembers(circleId) {
  try {
    const { data, error } = await getSupabaseClient().rpc('get_circle_members', { p_circle: circleId })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[Circles] getCircleMembers failed:', e?.message)
    return []
  }
}

// ── momentum roadmap: per-dream sharing (see 20260718000000_momentum_circles) ──
// A circle references members' existing Dreams via a visibility level; it keeps
// NO separate trackable. Default share level is dream_and_momentum.
export async function shareDreamToCircle(circleId, dreamId, shareLevel = 'dream_and_momentum') {
  try {
    const { error } = await getSupabaseClient().rpc('share_dream_to_circle', { p_circle: circleId, p_dream_id: dreamId, p_share_level: shareLevel })
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.warn('[Circles] shareDream failed:', e?.message)
    return { error: e?.message || 'Could not share' }
  }
}

export async function unshareDreamFromCircle(circleId, dreamId) {
  try {
    const { error } = await getSupabaseClient().rpc('unshare_dream_from_circle', { p_circle: circleId, p_dream_id: dreamId })
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.warn('[Circles] unshareDream failed:', e?.message)
    return { error: e?.message || 'Could not update' }
  }
}

// The caller's own shares in a circle → { [dreamId]: shareLevel }.
export async function getMyCircleShares(circleId) {
  try {
    const { data, error } = await getSupabaseClient().rpc('my_circle_shares', { p_circle: circleId })
    if (error) throw error
    const map = {}
    ;(data || []).forEach((r) => { map[r.dream_id] = r.share_level })
    return map
  } catch (e) {
    console.warn('[Circles] getMyCircleShares failed:', e?.message)
    return {}
  }
}

// The circle's shared-dream board (momentum honouring each share's level).
export async function getCircleDreams(circleId) {
  try {
    const { data, error } = await getSupabaseClient().rpc('get_circle_dreams', { p_circle: circleId })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[Circles] getCircleDreams failed:', e?.message)
    return []
  }
}

export default {
  createCircle, joinByCode, inviteToCircle, respondInvite, leaveCircle,
  getMyCircles, getMyInvites, getCircleMembers,
  shareDreamToCircle, unshareDreamFromCircle, getMyCircleShares, getCircleDreams,
}
