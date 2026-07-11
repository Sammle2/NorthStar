import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Ban, Flag, Flame, Heart, MessageCircle, MoreHorizontal, Send, TrendingUp, UserPlus, Users, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import Avatar from '../components/Avatar'
import { currentStreak } from '../store'
import { getFriendships, saveProfileNow } from '../../services/socialService'
import { getFriendsFeed, getPublicFeed, createPost, toggleLike } from '../../services/feedService'
import { reportPost, blockUser } from '../../services/moderationService'

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
  // Pending friend requests addressed to me — drives the badge + banner so an
  // incoming request is impossible to miss.
  const [incomingCount, setIncomingCount] = useState(0)
  // How many accepted friends I have — chooses which empty-state CTA to show.
  const [friendCount, setFriendCount] = useState(0)
  // The post whose report/block sheet is open, and a transient confirmation note.
  const [moderating, setModerating] = useState(null)
  const [modNote, setModNote] = useState(null)

  // My streak + overall progress toward the dream (avg of goal progress) — shown
  // under my own posts. Friends' posts show their streak from the public projection.
  const myStreak = currentStreak(profile)
  const myDreamPct = useMemo(() => {
    const gs = profile.goals || []
    return gs.length ? Math.round(gs.reduce((s, g) => s + (g.progress || 0), 0) / gs.length) : 0
  }, [profile])

  const load = async (which = feed) => {
    setLoading(true)
    // Friendships load on BOTH segments — the feed needs them on "My Friends",
    // and the pending-request badge/banner must show no matter where you are.
    const fs = await getFriendships()
    setIncomingCount(fs.filter((f) => f.status !== 'accepted' && f.addressee_id === myId).length)
    // Accepted friends where I'm actually a party — computed once, drives both
    // the friends feed and the empty-state CTA.
    const friendIds = fs
      .filter((f) => f.status === 'accepted' && (f.requester_id === myId || f.addressee_id === myId))
      .map((f) => (f.requester_id === myId ? f.addressee_id : f.requester_id))
    setFriendCount(friendIds.length)
    let rows
    if (which === 'friends') {
      rows = await getFriendsFeed(friendIds, myId)
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
    // Guarantee my public profile row exists first — the feed's inner join
    // requires it, so without it a fresh account's post is invisible to its own
    // author ("won't post"). The post's audience is whichever segment is selected
    // when it's sent: Public → everyone on the app, My Friends → friends only.
    await saveProfileNow(profile)
    const { error } = await createPost(text, feed === 'public' ? 'public' : 'friends')
    if (error) {
      // Post failed (offline / server error) — put the draft back so the user's
      // words aren't silently lost.
      setDraft(text)
    } else {
      await load(feed)
    }
    setPosting(false)
  }

  const like = async (p) => {
    // optimistic — roll back if the write fails so the heart never lies.
    // Roll back from the captured pre-toggle p.likedByMe, not current state.
    setPosts((arr) => arr.map((x) => (x.id === p.id ? { ...x, likedByMe: !x.likedByMe, likeCount: x.likeCount + (x.likedByMe ? -1 : 1) } : x)))
    const { error } = await toggleLike(p.id, myId, p.likedByMe)
    if (error) {
      setPosts((arr) => arr.map((x) => (x.id === p.id ? { ...x, likedByMe: p.likedByMe, likeCount: p.likeCount } : x)))
    }
  }

  // Report the flagged post: record it, then hide just that post locally.
  const doReport = async (p) => {
    setModerating(null)
    setPosts((arr) => arr.filter((x) => x.id !== p.id))
    await reportPost(p.id)
    setModNote('Thanks — reported. Our team will review it.')
    setTimeout(() => setModNote(null), 3200)
  }

  // Block the author: hide ALL their posts locally now (the feed RLS keeps them
  // hidden on every future load, both directions).
  const doBlock = async (p) => {
    const authorId = p.userId
    const name = p.author?.username ? `@${p.author.username}` : (p.author?.full_name || 'this user')
    setModerating(null)
    setPosts((arr) => arr.filter((x) => x.userId !== authorId))
    setFriendCount((c) => Math.max(0, c))
    await blockUser(authorId)
    setModNote(`Blocked ${name}. You won't see their posts anymore.`)
    setTimeout(() => setModNote(null), 3200)
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header: labeled Messages · My Friends/Public · Add — captions so the two
          entry points (chat + add friends) read as buttons, not decoration. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14 }}>
        <HeaderAction icon={MessageCircle} label="Messages" onPress={onOpenDMs} />

        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', backgroundColor: C.lineSoft, borderRadius: 999, padding: 3, borderWidth: 1, borderColor: C.lineMid }}>
            <Seg label="My Friends" active={feed === 'friends'} onPress={() => setFeed('friends')} />
            <Seg label="Public" active={feed === 'public'} onPress={() => setFeed('public')} />
          </View>
        </View>

        <HeaderAction icon={UserPlus} label="Add" onPress={onOpenAddFriends} badge={incomingCount} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {/* Pending friend requests — tap to review & accept */}
        {incomingCount > 0 && (
          <Pressable
            onPress={onOpenAddFriends}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 4, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)' }}
          >
            <UserPlus size={17} color={C.amber} strokeWidth={2.4} />
            <Text style={{ flex: 1, fontFamily: F.semibold, fontSize: 13.5, color: C.amber }}>
              {incomingCount === 1 ? '1 friend request waiting' : `${incomingCount} friend requests waiting`}
            </Text>
            <Text style={{ fontFamily: F.bold, fontSize: 12.5, color: C.amberInk, backgroundColor: C.amber, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' }}>Review</Text>
          </Pressable>
        )}

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
              {feed === 'public'
                ? 'No public posts yet. Be the first to share something with everyone.'
                : friendCount === 0
                  ? 'Your friends’ updates show up here. Add a few to get started.'
                  : 'No posts yet. Share an update above, or start a chat with a friend.'}
            </Text>
            {/* Every empty state offers a real action so nothing dead-ends. */}
            <View style={{ marginTop: 18 }}>
              {feed === 'public' ? (
                <EmptyAction icon={UserPlus} label="Find friends" onPress={onOpenAddFriends} />
              ) : friendCount === 0 ? (
                <EmptyAction icon={UserPlus} label="Add your first friend" primary onPress={onOpenAddFriends} />
              ) : (
                <EmptyAction icon={MessageCircle} label="Start a chat" onPress={onOpenDMs} />
              )}
            </View>
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
                {/* Report / block — only on other people's posts */}
                {p.userId !== myId && (
                  <Pressable onPress={() => setModerating(p)} hitSlop={10} style={{ padding: 4 }}>
                    <MoreHorizontal size={18} color={C.faint} strokeWidth={2.2} />
                  </Pressable>
                )}
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

      {/* Report / block action sheet */}
      {moderating && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,7,15,0.82)', justifyContent: 'flex-end', zIndex: 260 }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setModerating(null)} />
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: C.lineMid, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 34 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.dim, marginBottom: 14 }}>
              {moderating.author?.username ? `@${moderating.author.username}` : (moderating.author?.full_name || 'This member')}’s post
            </Text>
            <Pressable onPress={() => doReport(moderating)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Flag size={18} color={C.ink} strokeWidth={2.2} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.ink }}>Report post</Text>
                <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 1 }}>Flag it for our team to review.</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => doBlock(moderating)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
              <Ban size={18} color={C.red} strokeWidth={2.2} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.red }}>Block this user</Text>
                <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 1 }}>Hide all their posts. They won’t see yours either.</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => setModerating(null)} style={{ marginTop: 12, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.dim }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Transient confirmation after report/block */}
      {modNote && (
        <View style={{ position: 'absolute', bottom: 96, left: 16, right: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, zIndex: 270 }}>
          <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.ink2, lineHeight: 19 }}>{modNote}</Text>
        </View>
      )}

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

// A header entry point: the icon chip + a small caption below (mirrors the
// bottom tab bar's icon+label), so Messages and Add read as buttons. The pending
// -request badge pins to the icon's corner.
function HeaderAction({ icon: Icon, label, onPress, badge = 0 }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={{ alignItems: 'center' }}>
      <View style={iconChip}>
        <Icon size={20} color={C.ink} strokeWidth={2.2} />
        {badge > 0 && (
          <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: C.amber, borderWidth: 1.5, borderColor: C.bg }}>
            <Text style={{ fontFamily: F.bold, fontSize: 10.5, color: C.amberInk }}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={headerCaption}>{label}</Text>
    </Pressable>
  )
}

// Empty-state action button — primary (amber fill) or ghost (outline).
function EmptyAction({ icon: Icon, label, primary, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: primary ? C.amber : 'transparent', borderWidth: primary ? 0 : 1, borderColor: C.lineStrong }}
    >
      <Icon size={15} color={primary ? C.amberInk : C.dim} strokeWidth={2.4} />
      <Text style={{ fontFamily: primary ? F.bold : F.semibold, fontSize: 13, color: primary ? C.amberInk : C.dim }}>{label}</Text>
    </Pressable>
  )
}

const iconChip = { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineMid }
const headerCaption = { marginTop: 5, fontFamily: F.medium, fontSize: 9.5, color: C.dim, letterSpacing: 0.6, textTransform: 'uppercase' }
