import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Flame, Heart, MessageCircle, Send, TrendingUp, UserPlus, Users } from 'lucide-react-native'
import { C, F } from '../tokens'
import Avatar from '../components/Avatar'
import { getFriendships, saveProfileNow } from '../../services/socialService'
import { getFriendsFeed, getPublicFeed, createPost, toggleLike } from '../../services/feedService'

function timeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString()
}

// The Friends tab — a social home. DMs (top-left), My Friends / Public feed
// toggle (center), add friends (top-right), and a posts feed with a composer.
export default function Social({ profile, onOpenDMs, onOpenAddFriends, reloadKey }) {
  const myId = profile.userId
  const [feed, setFeed] = useState('friends') // 'friends' | 'public'
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  // My streak + overall progress toward the dream (avg of goal progress) — shown
  // under my own posts. Friends' posts show their streak from the public projection.
  const myStreak = profile.streak || 0
  const myDreamPct = useMemo(() => {
    const gs = profile.goals || []
    return gs.length ? Math.round(gs.reduce((s, g) => s + (g.progress || 0), 0) / gs.length) : 0
  }, [profile])

  const load = async (which = feed) => {
    setLoading(true)
    let rows
    if (which === 'friends') {
      const fs = await getFriendships()
      const ids = fs.filter((f) => f.status === 'accepted').map((f) => (f.requester_id === myId ? f.addressee_id : f.requester_id))
      rows = await getFriendsFeed(ids, myId)
    } else {
      rows = await getPublicFeed(myId)
    }
    setPosts(rows)
    setLoading(false)
  }
  useEffect(() => { load(feed) }, [feed, reloadKey])

  const post = async () => {
    const text = draft.trim()
    if (!text) return
    setPosting(true)
    setDraft('')
    // Guarantee my public profile row exists first — the posts SELECT policy and the
    // feed's inner join both require it, so without it a fresh account's post is
    // invisible to its own author ("won't post").
    await saveProfileNow(profile)
    await createPost(text)
    await load(feed)
    setPosting(false)
  }

  const like = async (p) => {
    // optimistic
    setPosts((arr) => arr.map((x) => (x.id === p.id ? { ...x, likedByMe: !x.likedByMe, likeCount: x.likeCount + (x.likedByMe ? -1 : 1) } : x)))
    await toggleLike(p.id, myId, p.likedByMe)
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header: DMs · My Friends/Public · Add friends */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14 }}>
        <Pressable onPress={onOpenDMs} hitSlop={10} style={iconBtn}>
          <MessageCircle size={20} color={C.ink} strokeWidth={2.2} />
        </Pressable>

        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', backgroundColor: C.lineSoft, borderRadius: 999, padding: 3, borderWidth: 1, borderColor: C.lineMid }}>
            <Seg label="My Friends" active={feed === 'friends'} onPress={() => setFeed('friends')} />
            <Seg label="Public" active={feed === 'public'} onPress={() => setFeed('public')} />
          </View>
        </View>

        <Pressable onPress={onOpenAddFriends} hitSlop={10} style={iconBtn}>
          <UserPlus size={20} color={C.ink} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {/* Composer */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Avatar url={profile.avatarUrl} name={profile.name} username={profile.username} size={40} />
          <View style={{ flex: 1 }}>
            <TextInput
              value={draft} onChangeText={setDraft}
              placeholder={feed === 'public' ? 'Share an update with everyone…' : 'Share an update with your friends…'}
              placeholderTextColor={C.faint2} multiline
              style={{ fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 6, minHeight: 24 }}
            />
            {draft.trim().length > 0 && (
              <Pressable onPress={post} disabled={posting} style={{ alignSelf: 'flex-end', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.amber }}>
                {posting ? <ActivityIndicator size="small" color={C.amberInk} /> : <Send size={13} color={C.amberInk} strokeWidth={2.4} />}
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.amberInk }}>Post</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Feed */}
        {loading ? (
          <ActivityIndicator size="small" color={C.faint} style={{ marginTop: 28 }} />
        ) : posts.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 }}>
            <Users size={28} color={C.faint2} strokeWidth={1.8} />
            <Text style={{ fontFamily: F.body, fontSize: 13.5, color: C.faint, marginTop: 12, textAlign: 'center', lineHeight: 20 }}>
              {feed === 'friends'
                ? 'No posts yet. Share an update above, or add friends to see theirs.'
                : 'No public posts yet. Be the first to share something with everyone.'}
            </Text>
          </View>
        ) : (
          posts.map((p) => (
            <View key={p.id} style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar url={p.author?.avatar_url} name={p.author?.full_name} username={p.author?.username} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: C.ink }}>{p.author?.full_name || 'NorthStar member'}</Text>
                  <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 1 }}>
                    {p.author?.username ? `@${p.author.username} · ` : ''}{timeAgo(p.createdAt)}
                  </Text>
                </View>
              </View>
              <Text style={{ fontFamily: F.body, fontSize: 15, color: C.ink2, lineHeight: 22, marginTop: 10 }}>{p.content}</Text>

              {/* Streak + dream-progress strip — the author's momentum, under the post.
                  Progress is shown for my own posts (computed locally); friends' posts
                  show their streak from the public projection. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Flame size={14} color={C.amber} strokeWidth={2.2} />
                  <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.dim }}>
                    {(p.userId === myId ? myStreak : (p.author?.streak || 0))}-day streak
                  </Text>
                </View>
                {p.userId === myId && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <TrendingUp size={14} color={C.violet} strokeWidth={2.2} />
                    <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.dim }}>{myDreamPct}% to dream</Text>
                  </View>
                )}
              </View>

              <Pressable onPress={() => like(p)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' }}>
                <Heart size={17} color={p.likedByMe ? C.pink : C.faint} fill={p.likedByMe ? C.pink : 'transparent'} strokeWidth={2.2} />
                {p.likeCount > 0 && <Text style={{ fontFamily: F.medium, fontSize: 13, color: p.likedByMe ? C.pink : C.faint }}>{p.likeCount}</Text>}
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

    </View>
  )
}

function Seg({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? C.amber : 'transparent' }}>
      <Text style={{ fontFamily: F.semibold, fontSize: 13, color: active ? C.amberInk : C.dim }}>{label}</Text>
    </Pressable>
  )
}

const iconBtn = { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineMid }
