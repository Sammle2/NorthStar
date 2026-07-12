// Feed service — posts + likes. Each post carries an AUDIENCE chosen at send time:
// 'public' (visible to everyone) or 'friends' (author + accepted friends only),
// enforced server-side by RLS. "My Friends" shows friends' posts (both audiences —
// you're their friend); "Public" shows audience='public' posts from anyone.
import { getSupabaseClient } from './supabaseAuth'

const AUTHOR = 'author:profiles!inner(id,username,full_name,avatar_url,visibility,streak,dream_progress)'
const SELECT = `id,user_id,content,media_url,media_type,audience,created_at,${AUTHOR},likes:post_likes(user_id)`

// True when the error is "column posts.audience does not exist" — the audience
// migration hasn't been applied yet, so we fall back to the legacy behavior.
const audienceColumnMissing = (e) => e?.code === '42703' || /audience.*does not exist|does not exist.*audience/i.test(e?.message || '')

function shape(rows, myId) {
  return (rows || []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    content: p.content,
    mediaUrl: p.media_url || null,
    mediaType: p.media_type || null,
    audience: p.audience || 'public',
    createdAt: p.created_at,
    author: p.author,
    likeCount: (p.likes || []).length,
    likedByMe: (p.likes || []).some((l) => l.user_id === myId),
  }))
}

export async function createPost(content, audience = 'public', media = null) {
  try {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const row = { user_id: user.id, content: content.trim(), audience }
    if (media && media.url) { row.media_url = media.url; row.media_type = media.type || 'image' }
    let { error } = await supabase.from('posts').insert(row)
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

// Edit a post's text and/or media. Pass media: null to remove media, or
// { url, type } to set it; omit media to leave it unchanged.
export async function updatePost(postId, { content, media } = {}) {
  try {
    const supabase = getSupabaseClient()
    const patch = {}
    if (content != null) patch.content = content.trim()
    if (media !== undefined) {
      patch.media_url = media ? media.url : null
      patch.media_type = media ? (media.type || 'image') : null
    }
    const { error } = await supabase.from('posts').update(patch).eq('id', postId)
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.warn('[Feed] updatePost failed:', e?.message)
    return { error: e?.message || 'Could not save changes' }
  }
}

// Upload a picked photo/video to the public post-media bucket (per-user folder,
// like avatars); returns { url, type } for createPost/updatePost.
export async function uploadPostMedia(userId, uri) {
  try {
    const supabase = getSupabaseClient()
    const res = await fetch(uri)
    const blob = await res.blob()
    const isVideo = (blob.type || '').startsWith('video')
    const ext = (blob.type && blob.type.split('/')[1]) || (isVideo ? 'mp4' : 'jpg')
    const path = `${userId}/post_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('post-media').upload(path, blob, {
      contentType: blob.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
      upsert: true,
    })
    if (error) throw error
    const { data } = supabase.storage.from('post-media').getPublicUrl(path)
    return { url: data.publicUrl, type: isVideo ? 'video' : 'image', error: null }
  } catch (e) {
    console.error('[Feed] media upload failed:', e?.message)
    return { url: null, type: null, error: e?.message || 'Upload failed' }
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

export default { createPost, getFriendsFeed, getPublicFeed, toggleLike, deletePost, updatePost, uploadPostMedia }
