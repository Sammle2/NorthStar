// Moderation — report a post, block/unblock a user. Backs the App Store UGC
// safety requirements (Apple Guideline 1.2). Blocked users' posts are also
// hidden at the DB layer by the posts RLS policy, so a block sticks on reload.
import { getSupabaseClient } from './supabaseAuth'

export async function reportPost(postId, reason = 'reported') {
  try {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('post_reports')
      .upsert({ post_id: postId, reporter_id: user.id, reason: String(reason).slice(0, 500) }, { onConflict: 'post_id,reporter_id' })
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.warn('[Moderation] report failed:', e?.message)
    return { error: e?.message || 'Could not report this post' }
  }
}

export async function blockUser(blockedId) {
  try {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('blocks')
      .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' })
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.warn('[Moderation] block failed:', e?.message)
    return { error: e?.message || 'Could not block this user' }
  }
}

export async function unblockUser(blockedId) {
  try {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', blockedId)
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.warn('[Moderation] unblock failed:', e?.message)
    return { error: e?.message || 'Could not unblock this user' }
  }
}

// Ids I've blocked (for local optimistic hiding; the feed RLS also enforces it).
export async function getBlockedIds() {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from('blocks').select('blocked_id')
    if (error) throw error
    return (data || []).map((r) => r.blocked_id)
  } catch (e) {
    console.warn('[Moderation] getBlockedIds failed:', e?.message)
    return []
  }
}
