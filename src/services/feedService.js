// Feed service — posts + likes. Each post carries an AUDIENCE chosen at send time:
// 'public' (visible to everyone) or 'friends' (author + accepted friends only),
// enforced server-side by RLS. "My Friends" shows friends' posts (both audiences —
// you're their friend); "Public" shows audience='public' posts from anyone.
import { getSupabaseClient } from './supabaseAuth'

const AUTHOR = 'author:profiles!inner(id,username,full_name,avatar_url,visibility,streak,dream_progress)'
const SELECT = `id,user_id,content,created_at,${AUTHOR},likes:post_likes(user_id)`

// True when the error is "column posts.audience does not exist" — the audience
// migration hasn't been applied yet, so we fall back to the legacy behavior.
const audienceColumnMissing = (e) => e?.code === '42703' || /audience.*does not exist|does not exist.*audience/i.test(e?.message || '')

function shape(rows, myId) {
  return (rows || []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    content: p.content,
    createdAt: p.created_at,
    author: p.author,
    likeCount: (p.likes || []).length,
    likedByMe: (p.likes || []).some((l) => l.user_id === myId),
  }))
}

export async function createPost(content, audience = 'public') {
  try {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    let { error } = await supabase.from('posts').insert({ user_id: user.id, content: content.trim(), audience })
    if (error && audienceColumnMissing(error)) {
      // Pre-migration fallback: post without the audience column (legacy behavior).
      ;({ error } = await supabase.from('posts').insert({ user_id: user.id, content: content.trim() }))
    }
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.error('[Feed] createPost failed:', e?.message)
    return { error: e?.message || 'Could not post' }
  }
}

// My Friends feed — posts by my accepted friends and me.
export async function getFriendsFeed(ids, myId) {
  const all = Array.from(new Set([...(ids || []), myId])).filter(Boolean)
  if (!all.length) return []
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('posts').select(SELECT)
      .in('user_id', all)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return shape(data, myId)
  } catch (e) {
    console.warn('[Feed] getFriendsFeed failed:', e?.message)
    return []
  }
}

// Public feed — every post SENT to Public, from anyone on the app (the author
// chose that audience at send time). Proximity ranking is a follow-up (needs
// device location); for now, most recent first. Pre-migration fallback: the old
// author-profile-visibility filter.
export async function getPublicFeed(myId) {
  const supabase = getSupabaseClient()
  try {
    const { data, error } = await supabase
      .from('posts').select(SELECT)
      .eq('audience', 'public')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return shape(data, myId)
  } catch (e) {
    if (audienceColumnMissing(e)) {
      try {
        const { data, error } = await supabase
          .from('posts').select(SELECT)
          .eq('author.visibility', 'public')
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) throw error
        return shape(data, myId)
      } catch (e2) {
        console.warn('[Feed] getPublicFeed (legacy) failed:', e2?.message)
        return []
      }
    }
    console.warn('[Feed] getPublicFeed failed:', e?.message)
    return []
  }
}

export async function toggleLike(postId, myId, liked) {
  try {
    const supabase = getSupabaseClient()
    if (liked) {
      const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', myId)
      if (error) throw error
    } else {
      const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: myId })
      if (error) throw error
    }
    return { error: null }
  } catch (e) {
    console.warn('[Feed] toggleLike failed:', e?.message)
    return { error: e?.message || 'Could not update like' }
  }
}

export async function deletePost(postId) {
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.warn('[Feed] deletePost failed:', e?.message)
    return { error: e?.message || 'Could not delete' }
  }
}

export default { createPost, getFriendsFeed, getPublicFeed, toggleLike, deletePost }
