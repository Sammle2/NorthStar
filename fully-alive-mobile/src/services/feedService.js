// Feed service — posts + likes. Posts are gated by author privacy (RLS): you see
// public authors, yourself, and accepted friends. "My Friends" filters to friends;
// "Public" filters to public authors.
import { getSupabaseClient } from './supabaseAuth'

const AUTHOR = 'author:profiles!inner(id,username,full_name,avatar_url,visibility,streak,current_goal)'
const SELECT = `id,user_id,content,created_at,${AUTHOR},likes:post_likes(user_id)`

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

export async function createPost(content) {
  try {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('posts').insert({ user_id: user.id, content: content.trim() })
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

// Public feed — posts from public accounts (anyone). Proximity ranking is a
// follow-up (needs device location); for now, most recent first.
export async function getPublicFeed(myId) {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('posts').select(SELECT)
      .eq('author.visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return shape(data, myId)
  } catch (e) {
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
