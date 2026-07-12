import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Ban, Flag, Flame, Globe, Heart, ImagePlus, Lock, MessageCircle, MoreHorizontal, Pencil, Send, Trash2, TrendingUp, UserPlus, Users, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import Avatar from '../components/Avatar'
import ConnectableProfileModal from '../components/ConnectableProfileModal'
import { CirclesPanel, CircleDetail } from './Circles'
import { currentStreak } from '../store'
import { getFriendships, getProfile, saveProfileNow } from '../../services/socialService'
import { getFriendsFeed, getPublicFeed, createPost, toggleLike, updatePost, deletePost, uploadPostMedia } from '../../services/feedService'
import { reportPost, blockUser } from '../../services/moderationService'
import { moderateImage } from '../../services/aiService'

// Build a SMALL base64 JPEG (no data: prefix) from a picked photo, or a frame
// sampled from a video, so media can be screened before it's posted. Web only
// (canvas) and kept tiny so it fits the AI proxy's input cap. Returns null if it
// can't produce one (native / decode failure) — moderation then simply skips.
async function makeModerationThumbnail(uri, type) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v) } }
    const timer = setTimeout(() => finish(null), 8000) // never hang a post on this
    const draw = (el, w, h) => {
      try {
        const MAX = 256
        const scale = Math.min(1, MAX / Math.max(w || MAX, h || MAX))
        const cw = Math.max(1, Math.round((w || MAX) * scale))
        const ch = Math.max(1, Math.round((h || MAX) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw; canvas.height = ch
        canvas.getContext('2d').drawImage(el, 0, 0, cw, ch)
        finish((canvas.toDataURL('image/jpeg', 0.5).split(',')[1]) || null)
      } catch { finish(null) }
    }
    try {
      if (type === 'video') {
        const v = document.createElement('video')
        v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = uri
        v.onloadeddata = () => { try { v.currentTime = Math.min(0.6, (v.duration || 2) / 3) } catch { draw(v, v.videoWidth, v.videoHeight) } }
        v.onseeked = () => draw(v, v.videoWidth, v.videoHeight)
        v.onerror = () => finish(null)
      } else {
        const img = new window.Image()
        img.onload = () => draw(img, img.naturalWidth, img.naturalHeight)
        img.onerror = () => finish(null)
        img.src = uri
      }
    } catch { finish(null) }
  })
}

// Renders a post's photo or video. Video plays via a native <video> on web (the
// deployed platform); native builds show a neutral placeholder (not shipped).
function PostMedia({ uri, type, height = 260, radius = 14 }) {
  if (type === 'video') {
    if (Platform.OS === 'web') {
      return React.createElement('video', {
        src: uri, controls: true, playsInline: true,
        style: { width: '100%', height, borderRadius: radius, background: '#000', objectFit: 'cover', display: 'block' },
      })
    }
    return (
      <View style={{ height, borderRadius: radius, backgroundColor: C.lineSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.faint }}>Video</Text>
      </View>
    )
  }
  return <Image source={{ uri }} style={{ width: '100%', height, borderRadius: radius, backgroundColor: C.lineSoft }} resizeMode="cover" />
}

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
  // Compose: attached media {uri,type} and the audience chosen for the new post.
  const [media, setMedia] = useState(null)
  const [composeAudience, setComposeAudience] = useState(feed === 'public' ? 'public' : 'friends')
  // Inline edit of my own post + a post pending delete confirmation.
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  // Pending friend requests addressed to me — drives the badge + banner so an
  // incoming request is impossible to miss.
  const [incomingCount, setIncomingCount] = useState(0)
  // How many accepted friends I have — chooses which empty-state CTA to show.
  const [friendCount, setFriendCount] = useState(0)
  // The post whose report/block sheet is open, and a transient confirmation note.
  const [moderating, setModerating] = useState(null)
  const [modNote, setModNote] = useState(null)
  // The author whose profile popup is open (tap a name/avatar in the feed).
  const [viewing, setViewing] = useState(null)
  // The circle whose stats board is open (from the Circles segment).
  const [openCircle, setOpenCircle] = useState(null)
  // Bumped when a circle changes (e.g. you leave one) to remount CirclesPanel.
  const [circlesEpoch, setCirclesEpoch] = useState(0)

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
    // Dedup by the other party: reciprocal requests (both sent, both accepted)
    // create two accepted rows for one friend — without this they'd double-count.
    const friendIds = [...new Set(
      fs
        .filter((f) => f.status === 'accepted' && (f.requester_id === myId || f.addressee_id === myId))
        .map((f) => (f.requester_id === myId ? f.addressee_id : f.requester_id)),
    )]
    setFriendCount(friendIds.length)
    // The Circles segment renders its own data (CirclesPanel) — no posts to fetch.
    if (which === 'circles') { setPosts([]); setLoading(false); return }
    const rows = which === 'friends' ? await getFriendsFeed(friendIds, myId) : await getPublicFeed(myId)
    setPosts(rows)
    setLoading(false)
  }
  useEffect(() => { load(feed) }, [feed, reloadKey])

  // Switching the Friends/Public segment nudges the compose audience to match,
  // but the composer's own toggle can override it before sending.
  useEffect(() => { if (feed === 'friends' || feed === 'public') setComposeAudience(feed) }, [feed])

  // Attach a photo or video (opens the OS/library picker; a file dialog on web).
  const pickMedia = async () => {
    try {
      await ImagePicker.requestMediaLibraryPermissionsAsync()
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 })
      if (res.canceled || !res.assets?.length) return
      const a = res.assets[0]
      setMedia({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image' })
    } catch (e) {
      console.warn('[Social] pickMedia failed:', e?.message)
    }
  }

  const post = async () => {
    const text = draft.trim()
    if (!text && !media) return
    setPosting(true)
    const localMedia = media
    // Screen media BEFORE uploading — a small local thumbnail (photo, or a frame
    // sampled from a video) goes to the vision moderator. A clear violation blocks
    // the post with a friendly reason; any error/uncertainty falls through, and
    // report/block remains the reactive backstop.
    if (localMedia) {
      const thumb = await makeModerationThumbnail(localMedia.uri, localMedia.type)
      const verdict = await moderateImage(thumb, localMedia.type)
      // Fail CLOSED: only post media that was actually checked AND cleared. A clear
      // violation shows the reason; anything we couldn't verify (moderation
      // unavailable / undecodable media) is held back rather than posted unscreened.
      const cleared = verdict && verdict.checked === true && verdict.allowed === true
      if (!cleared) {
        setPosting(false)
        setModNote(
          verdict && verdict.allowed === false
            ? (verdict.reason || 'That media can’t be posted — it may violate our community guidelines.')
            : 'Couldn’t check that media right now, so it wasn’t posted. Please try again in a moment.',
        )
        setTimeout(() => setModNote(null), 4800)
        return
      }
    }
    setDraft(''); setMedia(null)
    // Guarantee my public profile row exists first — the feed's inner join
    // requires it, so without it a fresh account's post is invisible to its own
    // author ("won't post").
    await saveProfileNow(profile)
    let uploaded = null
    if (localMedia) {
      const up = await uploadPostMedia(myId, localMedia.uri)
      if (up.error || !up.url) {
        setDraft(text); setMedia(localMedia); setPosting(false)
        setModNote('Couldn’t upload that file — try again.'); setTimeout(() => setModNote(null), 3200)
        return
      }
      uploaded = { url: up.url, type: up.type }
    }
    const { error } = await createPost(text, composeAudience, uploaded)
    if (error) {
      // Failed (offline/server) — restore the draft + media so nothing is lost.
      setDraft(text); setMedia(localMedia)
    } else {
      await load(feed)
    }
    setPosting(false)
  }

  // Inline edit of my own post's text.
  const startEdit = (p) => { setModerating(null); setEditingId(p.id); setEditDraft(p.content || '') }
  const saveEdit = async (p) => {
    const text = editDraft.trim()
    if (!text && !p.mediaUrl) return // don't let an edit blank out a text-only post
    setSavingEdit(true)
    const { error } = await updatePost(p.id, { content: text })
    if (!error) setPosts((arr) => arr.map((x) => (x.id === p.id ? { ...x, content: text } : x)))
    setSavingEdit(false); setEditingId(null)
  }

  // Delete my own post (after confirmation).
  const doDelete = async (p) => {
    setConfirmDelete(null); setModerating(null)
    setPosts((arr) => arr.filter((x) => x.id !== p.id))
    await deletePost(p.id)
    setModNote('Post deleted.'); setTimeout(() => setModNote(null), 2600)
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

  // Tap a name/avatar → open that person's profile (streak + % to dream, plus their
  // dream + bio). The post already carries streak + dream_progress, so the popup
  // shows instantly, then getProfile enriches it (RLS decides visibility, so a
  // private stranger gets the locked state). My own posts don't open a popup.
  const openProfile = async (author) => {
    if (!author?.id || author.id === myId) return
    setViewing({ ...author })
    const full = await getProfile(author.id)
    setViewing((v) => (v && v.id === author.id ? (full || { ...author, _private: true }) : v))
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header: labeled Messages · My Friends/Public · Add — captions so the two
          entry points (chat + add friends) read as buttons, not decoration. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14 }}>
        <HeaderAction icon={MessageCircle} label="Messages" onPress={onOpenDMs} />

        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, backgroundColor: C.lineSoft, borderRadius: 999, padding: 4, borderWidth: 1, borderColor: C.lineMid }}>
            <Seg label="Friends" active={feed === 'friends'} onPress={() => setFeed('friends')} />
            <Seg label="Public" active={feed === 'public'} onPress={() => setFeed('public')} />
            <Seg label="Circles" active={feed === 'circles'} onPress={() => setFeed('circles')} />
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

        {/* Circles segment shows the user's circles; otherwise the composer + feed. */}
        {feed === 'circles' ? (
          <CirclesPanel key={circlesEpoch} profile={profile} onOpenCircle={setOpenCircle} />
        ) : (
        <>
        {/* Composer */}
        <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Avatar url={profile.avatarUrl} name={profile.name} username={profile.username} size={40} />
            <TextInput
              value={draft} onChangeText={setDraft}
              placeholder={composeAudience === 'public' ? 'Share an update with everyone…' : 'Share an update with your friends…'}
              placeholderTextColor={C.faint2} multiline
              style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 6, minHeight: 24 }}
            />
          </View>

          {/* Attached-media preview */}
          {media && (
            <View style={{ marginTop: 12, marginLeft: 52 }}>
              <PostMedia uri={media.uri} type={media.type} height={180} />
              <Pressable onPress={() => setMedia(null)} hitSlop={8} style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,7,15,0.78)' }}>
                <X size={15} color="#fff" strokeWidth={2.4} />
              </Pressable>
            </View>
          )}

          {/* Action bar: attach media · audience · post */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginLeft: 52 }}>
            <Pressable onPress={pickMedia} hitSlop={6} style={composerChip}>
              <ImagePlus size={15} color={C.violet} strokeWidth={2.2} />
              <Text style={composerChipTxt}>Photo/Video</Text>
            </Pressable>
            <Pressable onPress={() => setComposeAudience((a) => (a === 'public' ? 'friends' : 'public'))} hitSlop={6} style={composerChip}>
              {composeAudience === 'public' ? <Globe size={14} color={C.violet} strokeWidth={2.2} /> : <Lock size={14} color={C.violet} strokeWidth={2.2} />}
              <Text style={composerChipTxt}>{composeAudience === 'public' ? 'Public' : 'Friends'}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {(draft.trim().length > 0 || media) && (
              <Pressable onPress={post} disabled={posting} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.amber }}>
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
                <Pressable onPress={() => openProfile(p.author)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Avatar url={p.author?.avatar_url} name={p.author?.full_name} username={p.author?.username} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: C.ink }}>{p.author?.full_name || 'NorthStar member'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
                      <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint }}>
                        {p.author?.username ? `@${p.author.username} · ` : ''}{timeAgo(p.createdAt)}
                      </Text>
                      {/* Friends-only badge so authors can see a post's audience at a glance */}
                      {p.audience === 'friends' && (
                        <>
                          <Lock size={10} color={C.faint} strokeWidth={2.2} />
                          <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.faint }}>Friends</Text>
                        </>
                      )}
                    </View>
                  </View>
                </Pressable>
                {/* “…” menu — edit/delete on my posts, report/block on others’ */}
                <Pressable onPress={() => setModerating(p)} hitSlop={10} style={{ padding: 4 }}>
                  <MoreHorizontal size={18} color={C.faint} strokeWidth={2.2} />
                </Pressable>
              </View>

              {/* Body — inline editor for my own post, otherwise the text + media */}
              {editingId === p.id ? (
                <View style={{ marginTop: 10 }}>
                  <TextInput
                    value={editDraft} onChangeText={setEditDraft} multiline autoFocus
                    placeholder="Edit your post…" placeholderTextColor={C.faint2}
                    style={{ fontFamily: F.body, fontSize: 15, color: C.ink, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 64, textAlignVertical: 'top' }}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <Pressable onPress={() => setEditingId(null)} style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: C.lineStrong }}>
                      <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.dim }}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={() => saveEdit(p)} disabled={savingEdit} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: C.amber }}>
                      {savingEdit ? <ActivityIndicator size="small" color={C.amberInk} /> : null}
                      <Text style={{ fontFamily: F.bold, fontSize: 12.5, color: C.amberInk }}>Save</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  {p.content ? <Text style={{ fontFamily: F.body, fontSize: 15, color: C.ink2, lineHeight: 22, marginTop: 10 }}>{p.content}</Text> : null}
                  {p.mediaUrl ? (
                    <View style={{ marginTop: 12 }}>
                      <PostMedia uri={p.mediaUrl} type={p.mediaType} height={260} />
                    </View>
                  ) : null}
                </>
              )}

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
                {/* Dream progress: my own is computed locally (live); friends' comes
                    from their public projection (dream_progress). Hidden if unknown. */}
                {(() => {
                  const pct = p.userId === myId ? myDreamPct : p.author?.dream_progress
                  if (pct == null) return null
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <TrendingUp size={14} color={C.violet} strokeWidth={2.2} />
                      <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.dim }}>{pct}% to dream</Text>
                    </View>
                  )
                })()}
              </View>

              <Pressable onPress={() => like(p)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' }}>
                <Heart size={17} color={p.likedByMe ? C.pink : C.faint} fill={p.likedByMe ? C.pink : 'transparent'} strokeWidth={2.2} />
                {p.likeCount > 0 && <Text style={{ fontFamily: F.medium, fontSize: 13, color: p.likedByMe ? C.pink : C.faint }}>{p.likeCount}</Text>}
              </Pressable>
            </View>
          ))
        )}
        </>
        )}
      </ScrollView>

      {/* Post action sheet — mine: edit/delete · others’: report/block */}
      {moderating && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,7,15,0.82)', justifyContent: 'flex-end', zIndex: 260 }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setModerating(null)} />
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: C.lineMid, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 34 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.dim, marginBottom: 14 }}>
              {moderating.userId === myId ? 'Your post' : `${moderating.author?.username ? '@' + moderating.author.username : (moderating.author?.full_name || 'This member')}’s post`}
            </Text>
            {moderating.userId === myId ? (
              <>
                <Pressable onPress={() => startEdit(moderating)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <Pencil size={18} color={C.ink} strokeWidth={2.2} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.ink }}>Edit post</Text>
                    <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 1 }}>Change what you wrote.</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => { setModerating(null); setConfirmDelete(moderating) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                  <Trash2 size={18} color={C.red} strokeWidth={2.2} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.red }}>Delete post</Text>
                    <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 1 }}>Remove it for everyone. Can’t be undone.</Text>
                  </View>
                </Pressable>
              </>
            ) : (
              <>
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
              </>
            )}
            <Pressable onPress={() => setModerating(null)} style={{ marginTop: 12, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.dim }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,7,15,0.86)', alignItems: 'center', justifyContent: 'center', padding: 28, zIndex: 280 }}>
          <View style={{ width: '100%', maxWidth: 400, borderRadius: 20, padding: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.lineMid }}>
            <Text style={{ fontFamily: F.display, fontSize: 16, color: C.ink, letterSpacing: 0.4, textAlign: 'center' }}>Delete this post?</Text>
            <Text style={{ fontFamily: F.body, fontSize: 13.5, color: C.dim, lineHeight: 20, textAlign: 'center', marginTop: 8 }}>This removes it for everyone. It can’t be undone.</Text>
            <Pressable onPress={() => doDelete(confirmDelete)} style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 20, backgroundColor: C.red }}>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: '#fff' }}>Delete post</Text>
            </Pressable>
            <Pressable onPress={() => setConfirmDelete(null)} style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: C.lineStrong }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.dim }}>Keep it</Text>
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

      {/* Tap a name/avatar in the feed → their profile (streak + % to dream),
          with the option to add them as a friend. openProfile skips my own card. */}
      {viewing && <ConnectableProfileModal card={viewing} myId={myId} onClose={() => setViewing(null)} onChanged={load} />}

      {/* A circle's stats board (opened from the Circles segment). onClose(true)
          means something changed (e.g. you left) → remount the panel to refresh. */}
      {openCircle && (
        <CircleDetail
          profile={profile}
          circle={openCircle}
          onClose={(changed) => { setOpenCircle(null); if (changed) setCirclesEpoch((n) => n + 1) }}
        />
      )}
    </View>
  )
}

function Seg({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? C.amber : 'transparent' }}>
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
const composerChip = { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }
const composerChipTxt = { fontFamily: F.semibold, fontSize: 12, color: C.violet }
