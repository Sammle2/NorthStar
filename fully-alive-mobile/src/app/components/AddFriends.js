import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Check, Clock, Lock, Search, UserPlus, Users, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import Avatar from './Avatar'
import StreakBadge from './StreakBadge'
import {
  getFriendships, getProfilesByIds, getIdentities, searchProfiles, getProfile,
  sendFriendRequest, acceptFriendRequest, removeFriendship,
} from '../../services/socialService'
import { openDm, sendMessage } from '../../services/dmService'

// Full-screen overlay: search people, manage requests, and see your friends.
// Opened from the people+plus icon on the Friends tab.
export default function AddFriends({ profile, onClose, onChanged }) {
  const myId = profile.userId
  const [friendships, setFriendships] = useState([])
  const [cards, setCards] = useState({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    const fs = await getFriendships()
    setFriendships(fs)
    const ids = Array.from(new Set(fs.flatMap((f) => [f.requester_id, f.addressee_id]).filter((id) => id !== myId)))
    if (ids.length) {
      const [idents, full] = await Promise.all([getIdentities(ids), getProfilesByIds(ids)])
      const map = {}
      idents.forEach((r) => { map[r.id] = r })
      full.forEach((r) => { map[r.id] = { ...map[r.id], ...r } })
      setCards(map)
    } else setCards({})
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const { friends, incoming } = useMemo(() => {
    const friends = [], incoming = []
    for (const f of friendships) {
      const otherId = f.requester_id === myId ? f.addressee_id : f.requester_id
      const entry = { friendship: f, otherId, card: cards[otherId] }
      if (f.status === 'accepted') friends.push(entry)
      else if (f.addressee_id === myId) incoming.push(entry)
    }
    return { friends, incoming }
  }, [friendships, cards, myId])

  const statusFor = (userId) => {
    const f = friendships.find((x) => x.requester_id === userId || x.addressee_id === userId)
    if (!f) return { kind: 'none' }
    if (f.status === 'accepted') return { kind: 'friends', f }
    if (f.addressee_id === myId) return { kind: 'incoming', f }
    return { kind: 'outgoing', f }
  }

  const runSearch = async (q) => {
    setQuery(q)
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    const rows = await searchProfiles(q)
    setResults(rows.filter((r) => r.id !== myId))
    setSearching(false)
  }

  const after = async () => { await load(); onChanged?.() }
  const add = async (id) => { setBusyId(id); await sendFriendRequest(id, myId); await after(); setBusyId(null) }
  const accept = async (fid, otherId) => {
    setBusyId(fid)
    await acceptFriendRequest(fid)
    // Notify the requester we accepted — they get a DM and can now see our posts.
    if (otherId) {
      try {
        const myName = (profile.name || '').split(' ')[0] || 'I'
        const { conversationId } = await openDm(otherId)
        if (conversationId) {
          await sendMessage(conversationId, myId, `${myName} accepted your friend request — you're connected now. You can see each other's posts. 🎉`)
        }
      } catch (e) {
        console.warn('[AddFriends] accept notification failed:', e?.message)
      }
    }
    await after()
    setBusyId(null)
  }
  const remove = async (fid) => { setBusyId(fid); await removeFriendship(fid); await after(); setBusyId(null) }
  const openUser = async (id) => {
    const full = await getProfile(id)
    const identity = cards[id] || results.find((r) => r.id === id)
    setViewing(full || (identity ? { ...identity, _private: true } : null))
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 240 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, letterSpacing: 1.2 }}>ADD FRIENDS</Text>
          <Pressable onPress={onClose} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineMid }}>
            <X size={18} color={C.dim} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 14 }}>
          <Search size={16} color={C.faint2} strokeWidth={2} />
          <TextInput value={query} onChangeText={runSearch} placeholder="Search by name or @username" placeholderTextColor={C.faint2} autoCapitalize="none" autoComplete="off" autoFocus style={{ flex: 1, fontFamily: F.body, fontSize: 14.5, color: C.ink, paddingVertical: 12 }} />
          {searching ? <ActivityIndicator size="small" color={C.faint} /> : query ? <Pressable onPress={() => runSearch('')} hitSlop={8}><X size={15} color={C.faint2} strokeWidth={2} /></Pressable> : null}
        </View>

        {results.map((r) => {
          const st = statusFor(r.id)
          return (
            <PersonRow key={r.id} card={r} onPress={() => openUser(r.id)}>
              {st.kind === 'friends' && <Tag icon={Check} label="Friends" />}
              {st.kind === 'outgoing' && <Tag icon={Clock} label="Requested" />}
              {st.kind === 'incoming' && <ActionBtn busy={busyId === st.f.id} onPress={() => accept(st.f.id, r.id)} label="Accept" />}
              {st.kind === 'none' && <ActionBtn busy={busyId === r.id} onPress={() => add(r.id)} label="Add" icon={UserPlus} />}
            </PersonRow>
          )
        })}
        {query.trim().length >= 2 && !searching && results.length === 0 && (
          <Text style={{ fontFamily: F.body, fontSize: 13, color: C.faint, marginTop: 14, textAlign: 'center' }}>No one found for “{query.trim()}”.</Text>
        )}

        {incoming.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Text style={sectionLabel}>REQUESTS · {incoming.length}</Text>
            {incoming.map(({ friendship, otherId, card }) => (
              <PersonRow key={friendship.id} card={card || { id: otherId }} onPress={() => openUser(otherId)}>
                <ActionBtn busy={busyId === friendship.id} onPress={() => accept(friendship.id, otherId)} label="Accept" />
                <Pressable onPress={() => remove(friendship.id)} disabled={busyId === friendship.id} style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.lineStrong }}>
                  <X size={14} color={C.dim} strokeWidth={2.2} />
                </Pressable>
              </PersonRow>
            ))}
          </View>
        )}

        <View style={{ marginTop: 28 }}>
          <Text style={sectionLabel}>FRIENDS{friends.length ? ` · ${friends.length}` : ''}</Text>
          {loading ? <ActivityIndicator size="small" color={C.faint} style={{ marginTop: 12 }} /> : friends.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, borderRadius: 16, borderWidth: 1, borderColor: C.lineMid, backgroundColor: C.violetFill07 }}>
              <Users size={24} color={C.faint2} strokeWidth={1.8} />
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.faint, marginTop: 10, textAlign: 'center', paddingHorizontal: 24, lineHeight: 19 }}>Search above to find people and add them.</Text>
            </View>
          ) : friends.map(({ friendship, otherId, card }) => (
            <PersonRow key={friendship.id} card={card || { id: otherId }} onPress={() => openUser(otherId)}>
              {card ? <StreakBadge streak={card.streak || 0} /> : null}
            </PersonRow>
          ))}
        </View>
      </ScrollView>

      {viewing && (
        <UserProfileModal card={viewing} status={statusFor(viewing.id)} busy={!!busyId} onClose={() => setViewing(null)}
          onAdd={() => add(viewing.id)} onAccept={(fid) => accept(fid, viewing.id)} onRemove={(fid) => remove(fid)} />
      )}
    </View>
  )
}

function PersonRow({ card, onPress, children }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Avatar url={card.avatar_url} name={card.full_name} username={card.username} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: C.ink }} numberOfLines={1}>{card.full_name || 'NorthStar member'}</Text>
        {card.username ? <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 1 }}>@{card.username}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>{children}</View>
    </Pressable>
  )
}

function ActionBtn({ busy, onPress, label, icon: Icon }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: C.amber }}>
      {busy ? <ActivityIndicator size="small" color={C.amberInk} /> : <>{Icon && <Icon size={13} color={C.amberInk} strokeWidth={2.4} />}<Text style={{ fontFamily: F.bold, fontSize: 12.5, color: C.amberInk }}>{label}</Text></>}
    </Pressable>
  )
}

function Tag({ icon: Icon, label }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}>
      <Icon size={12} color={C.dim} strokeWidth={2.2} />
      <Text style={{ fontFamily: F.semibold, fontSize: 11.5, color: C.dim }}>{label}</Text>
    </View>
  )
}

function CardRow({ label, value, color }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontFamily: F.display, fontSize: 9.5, color: C.faint, letterSpacing: 1.6, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontFamily: F.body, fontSize: 13.5, color: C.ink2, lineHeight: 19 }} numberOfLines={3}>{value}</Text>
      <View style={{ height: 2, width: 26, borderRadius: 2, backgroundColor: color, marginTop: 8, opacity: 0.6 }} />
    </View>
  )
}

function UserProfileModal({ card, status, busy, onClose, onAdd, onAccept, onRemove }) {
  const isPrivate = card._private
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,7,15,0.86)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 260 }}>
      <View style={{ width: '100%', maxWidth: 420, borderRadius: 22, padding: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.lineMid }}>
        <Pressable onPress={onClose} hitSlop={10} style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}><X size={20} color={C.dim} strokeWidth={2.2} /></Pressable>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Avatar url={card.avatar_url} name={card.full_name} username={card.username} size={88} ring />
          <Text style={{ fontFamily: F.display, fontSize: 20, color: C.ink, letterSpacing: 0.5, marginTop: 12 }}>{card.full_name || 'NorthStar member'}</Text>
          {card.username ? <Text style={{ fontFamily: F.body, fontSize: 13, color: C.violet, marginTop: 2 }}>@{card.username}</Text> : null}
          {!isPrivate && <View style={{ marginTop: 12 }}><StreakBadge streak={card.streak || 0} /></View>}
        </View>
        {isPrivate ? (
          <View style={{ alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid }}>
            <Lock size={20} color={C.faint2} strokeWidth={2} />
            <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: C.dim, marginTop: 8 }}>This account is private</Text>
            <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>Add them as a friend to see their dream, streak, and goals.</Text>
          </View>
        ) : (
          <>
            {card.current_goal ? <CardRow label="WORKING ON" value={card.current_goal} color={C.amber} /> : null}
            {card.dream ? <CardRow label="DREAM" value={card.dream} color={C.violet} /> : null}
            {card.bio ? <CardRow label="BIO" value={card.bio} color={C.dim} /> : null}
          </>
        )}
        <View style={{ marginTop: 20 }}>
          {status.kind === 'none' && <Pressable onPress={onAdd} disabled={busy} style={modalPrimary}>{busy ? <ActivityIndicator size="small" color={C.amberInk} /> : <><UserPlus size={15} color={C.amberInk} strokeWidth={2.4} /><Text style={modalPrimaryTxt}>Add friend</Text></>}</Pressable>}
          {status.kind === 'outgoing' && <Pressable onPress={() => onRemove(status.f.id)} disabled={busy} style={modalSecondary}><Text style={modalSecondaryTxt}>{busy ? 'Cancelling…' : 'Cancel request'}</Text></Pressable>}
          {status.kind === 'incoming' && <Pressable onPress={() => onAccept(status.f.id)} disabled={busy} style={modalPrimary}>{busy ? <ActivityIndicator size="small" color={C.amberInk} /> : <><Check size={15} color={C.amberInk} strokeWidth={2.6} /><Text style={modalPrimaryTxt}>Accept request</Text></>}</Pressable>}
          {status.kind === 'friends' && <Pressable onPress={() => onRemove(status.f.id)} disabled={busy} style={modalSecondary}><Text style={modalSecondaryTxt}>{busy ? 'Removing…' : 'Remove friend'}</Text></Pressable>}
        </View>
      </View>
    </View>
  )
}

const sectionLabel = { fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 3, marginBottom: 12 }
const modalPrimary = { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, backgroundColor: C.amber }
const modalPrimaryTxt = { fontFamily: F.bold, fontSize: 14.5, color: C.amberInk }
const modalSecondary = { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }
const modalSecondaryTxt = { fontFamily: F.semibold, fontSize: 14, color: C.dim }
