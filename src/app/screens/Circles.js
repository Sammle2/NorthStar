import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { ArrowLeft, Check, Copy, Flame, Plus, TrendingUp, UserPlus, Users, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import Avatar from '../components/Avatar'
import GlowProgress from '../components/GlowProgress'
import ConnectableProfileModal from '../components/ConnectableProfileModal'
import { todayKey, liveStreakOf } from '../store'
import {
  createCircle, joinByCode, inviteToCircle, respondInvite, leaveCircle,
  getMyCircles, getMyInvites, getCircleMembers,
} from '../../services/circleService'
import { getFriendships, getIdentities, getProfile } from '../../services/socialService'
import CircleDreams from '../../momentum/CircleDreams'

// Live streak / hit-today from the raw values the RPC returns — one shared
// definition (store.liveStreakOf) so circles, the feed, and profile cards agree.
const liveStreak = (m) => liveStreakOf(m.streak, m.last_check_in)
const hitToday = (m) => m.last_check_in === todayKey()

const copyText = (t) => { try { navigator?.clipboard?.writeText?.(t) } catch (e) {} }

// ── The Circles panel (rendered inside the Friends tab's "Circles" segment) ───
export function CirclesPanel({ profile, onOpenCircle }) {
  const [circles, setCircles] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState(null) // 'create' | 'join' | null
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [newCode, setNewCode] = useState(null) // freshly created circle's code to share

  const load = async () => {
    const [cs, iv] = await Promise.all([getMyCircles(), getMyInvites()])
    setCircles(cs); setInvites(iv); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const submit = async () => {
    const v = text.trim()
    if (!v || busy) return
    setBusy(true); setError('')
    if (mode === 'create') {
      const { circle, error } = await createCircle(v)
      if (error) setError(error)
      else { setNewCode(circle.join_code); setText(''); setMode(null); await load() }
    } else {
      const { circle, error } = await joinByCode(v)
      if (error) setError(error)
      else { setText(''); setMode(null); await load(); if (circle) onOpenCircle(circle) }
    }
    setBusy(false)
  }

  const respond = async (circleId, accept) => {
    setBusy(true)
    await respondInvite(circleId, accept)
    await load()
    setBusy(false)
  }

  return (
    <View style={{ paddingTop: 4 }}>
      {/* Freshly created — surface the code to share */}
      {newCode && (
        <View style={{ borderRadius: 16, padding: 16, marginBottom: 16, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}>
          <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim }}>Circle created! Share this code so people can join:</Text>
          <Pressable onPress={() => copyText(newCode)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <Text style={{ fontFamily: F.display, fontSize: 26, letterSpacing: 4, color: C.ink }}>{newCode}</Text>
            <Copy size={16} color={C.violet} strokeWidth={2.2} />
          </Pressable>
          <Pressable onPress={() => setNewCode(null)} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.violet }}>Done</Text>
          </Pressable>
        </View>
      )}

      {/* Create / Join actions */}
      {mode ? (
        <View style={{ borderRadius: 16, padding: 16, marginBottom: 16, backgroundColor: 'rgba(13,13,27,0.85)', borderWidth: 1, borderColor: C.lineMid }}>
          <Text style={{ fontFamily: F.display, fontSize: 10.5, color: C.violet, letterSpacing: 1.6, marginBottom: 10 }}>
            {mode === 'create' ? 'NAME YOUR CIRCLE' : 'ENTER A JOIN CODE'}
          </Text>
          <TextInput
            value={text}
            onChangeText={(t) => setText(mode === 'join' ? t.toUpperCase() : t)}
            onSubmitEditing={submit}
            autoFocus
            autoCapitalize={mode === 'join' ? 'characters' : 'words'}
            placeholder={mode === 'create' ? 'e.g. Sunrise Squad' : 'e.g. PZA9ZU'}
            placeholderTextColor={C.faint2}
            style={{ backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, fontFamily: F.body, fontSize: 15, color: C.ink, letterSpacing: mode === 'join' ? 3 : 0 }}
          />
          {error ? <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.red, marginTop: 8 }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Pressable onPress={() => { setMode(null); setText(''); setError('') }} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.dim }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} disabled={!text.trim() || busy} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: text.trim() && !busy ? C.amber : C.faint3 }}>
              {busy ? <ActivityIndicator size="small" color={C.amberInk} /> : <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.amberInk }}>{mode === 'create' ? 'Create' : 'Join'}</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
          <Pressable onPress={() => { setMode('create'); setError('') }} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 13, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}>
            <Plus size={15} color={C.violet} strokeWidth={2.6} /><Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.violet }}>Create circle</Text>
          </Pressable>
          <Pressable onPress={() => { setMode('join'); setError('') }} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 13, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid }}>
            <Users size={15} color={C.dim} strokeWidth={2.2} /><Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.dim }}>Join with code</Text>
          </Pressable>
        </View>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <View style={{ marginBottom: 18 }}>
          <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 10 }}>INVITES</Text>
          {invites.map((iv) => (
            <View key={iv.circle_id} style={{ borderRadius: 14, padding: 14, marginBottom: 8, backgroundColor: 'rgba(245,158,11,0.06)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)' }}>
              <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.ink }}>{iv.name}</Text>
              <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 2 }}>{iv.invited_by_name} invited you · {iv.member_count} member{iv.member_count === 1 ? '' : 's'}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable onPress={() => respond(iv.circle_id, true)} disabled={busy} style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: C.amber }}><Text style={{ fontFamily: F.bold, fontSize: 12.5, color: C.amberInk }}>Join</Text></Pressable>
                <Pressable onPress={() => respond(iv.circle_id, false)} disabled={busy} style={{ borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }}><Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.dim }}>Ignore</Text></Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* My circles */}
      <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 10 }}>MY CIRCLES{circles.length ? ` · ${circles.length}` : ''}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={C.faint} style={{ marginTop: 12 }} />
      ) : circles.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 28, borderRadius: 16, borderWidth: 1, borderColor: C.lineMid, backgroundColor: C.violetFill07 }}>
          <Users size={24} color={C.faint2} strokeWidth={1.8} />
          <Text style={{ fontFamily: F.body, fontSize: 13, color: C.faint, marginTop: 10, textAlign: 'center', paddingHorizontal: 30, lineHeight: 19 }}>No circles yet. Create one and share the code, or join a friend's with theirs — then you'll see each other's daily progress here.</Text>
        </View>
      ) : (
        circles.map((c) => (
          <Pressable key={c.id} onPress={() => onOpenCircle(c)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 15, marginBottom: 8, backgroundColor: pressed ? 'rgba(167,139,250,0.14)' : C.card, borderWidth: 1, borderColor: pressed ? C.violet : C.line })}>
            <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill }}>
              <Users size={20} color={C.violet} strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.ink }} numberOfLines={1}>{c.name}</Text>
              <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 1 }}>{c.member_count} member{c.member_count === 1 ? '' : 's'}{c.is_owner ? ' · you own this' : ''}</Text>
            </View>
            <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.violet }}>→</Text>
          </Pressable>
        ))
      )}
    </View>
  )
}

// ── Circle detail — the member stats board (full-screen overlay) ──────────────
export function CircleDetail({ profile, circle, onClose, onMessageUser }) {
  const myId = profile.userId
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null) // profile popup
  const [inviting, setInviting] = useState(false)
  const [friends, setFriends] = useState([])
  const [invited, setInvited] = useState({}) // userId -> true (this session)
  const [left, setLeft] = useState(false)

  const load = async () => { setMembers(await getCircleMembers(circle.id)); setLoading(false) }
  useEffect(() => { load() }, [circle.id])

  const openInvite = async () => {
    setInviting(true)
    const fs = (await getFriendships()) || []
    const ids = [...new Set(fs.filter((f) => f.status === 'accepted').map((f) => (f.requester_id === myId ? f.addressee_id : f.requester_id)))]
    const memberIds = new Set(members.map((m) => m.user_id))
    setFriends((await getIdentities(ids)).filter((f) => !memberIds.has(f.id)))
  }
  const invite = async (id) => { setInvited((s) => ({ ...s, [id]: true })); await inviteToCircle(circle.id, id) }
  const leave = async () => { setLeft(true); await leaveCircle(circle.id); onClose(true) }

  const openMember = async (m) => {
    if (m.user_id === myId) return
    setViewing({ id: m.user_id, full_name: m.name, username: m.username, avatar_url: m.avatar_url, streak: m.streak, last_check_in: m.last_check_in, dream_progress: m.dream_progress })
    const full = await getProfile(m.user_id)
    setViewing((v) => (v && v.id === m.user_id ? (full || { ...v, _private: true }) : v))
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 250 }}>
      <View style={{ flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Pressable onPress={() => onClose(false)} hitSlop={10}><ArrowLeft size={22} color={C.dim} strokeWidth={2.2} /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.display, fontSize: 16, color: C.ink, letterSpacing: 0.5 }} numberOfLines={1}>{circle.name}</Text>
            <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint, marginTop: 1 }}>{members.length || circle.member_count || 0} member{(members.length || circle.member_count) === 1 ? '' : 's'}</Text>
          </View>
          <Pressable onPress={openInvite} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}>
            <UserPlus size={13} color={C.violet} strokeWidth={2.3} /><Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.violet }}>Invite</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
          {/* Share code */}
          {circle.join_code ? (
            <Pressable onPress={() => copyText(circle.join_code)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid }}>
              <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim }}>Invite code</Text>
              <Text style={{ fontFamily: F.display, fontSize: 16, letterSpacing: 3, color: C.ink }}>{circle.join_code}</Text>
              <Copy size={14} color={C.violet} strokeWidth={2.2} style={{ marginLeft: 'auto' }} />
            </Pressable>
          ) : null}

          {loading ? (
            <ActivityIndicator size="small" color={C.faint} style={{ marginTop: 24 }} />
          ) : (
            members.map((m) => {
              const streak = liveStreak(m)
              const hit = hitToday(m)
              const isMe = m.user_id === myId
              const pct = m.dream_progress || 0
              return (
                <Pressable key={m.user_id} onPress={() => openMember(m)} disabled={isMe} style={({ pressed }) => ({ borderRadius: 16, padding: 15, marginBottom: 10, backgroundColor: pressed && !isMe ? 'rgba(167,139,250,0.12)' : 'rgba(13,13,27,0.8)', borderWidth: 1, borderColor: hit ? 'rgba(245,158,11,0.35)' : C.line })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Avatar url={m.avatar_url} name={m.name} username={m.username} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.ink }} numberOfLines={1}>
                        {m.name || 'NorthStar member'}{isMe ? ' (you)' : ''}{m.status === 'owner' ? '  ·  owner' : ''}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Flame size={13} color={streak > 0 ? C.amber : C.faint2} strokeWidth={2.2} />
                          <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.dim }}>{streak}-day</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TrendingUp size={13} color={C.violet} strokeWidth={2.2} />
                          <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.dim }}>{pct}% to dream</Text>
                        </View>
                      </View>
                    </View>
                    {/* Hit-today ring */}
                    <View style={{ alignItems: 'center', width: 52 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: hit ? C.amber : 'transparent', borderWidth: hit ? 0 : 2, borderColor: C.faint3 }}>
                        {hit ? <Check size={17} color={C.amberInk} strokeWidth={3} /> : <Flame size={15} color={C.faint3} strokeWidth={2} />}
                      </View>
                      <Text style={{ fontFamily: F.medium, fontSize: 9.5, color: hit ? C.amber : C.faint2, marginTop: 3 }}>{hit ? 'today' : 'not yet'}</Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <GlowProgress value={pct} color={pct >= 100 ? C.green : C.violet} height={5} />
                  </View>
                </Pressable>
              )
            })
          )}

          {/* Momentum roadmap: shared-dream board + per-dream share controls for
              this circle. Reads getCircleDreams/my_circle_shares — degrades to an
              empty state until the 20260718 migration is applied. */}
          <CircleDreams circle={circle} profile={profile} />

          {/* Leave circle */}
          <Pressable onPress={leave} disabled={left} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 18, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }}>
            <X size={15} color={C.red} strokeWidth={2} /><Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.red }}>Leave circle</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Invite friends sheet */}
      {inviting && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,7,15,0.86)', justifyContent: 'flex-end', zIndex: 300 }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: C.lineMid, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ fontFamily: F.display, fontSize: 15, color: C.ink, letterSpacing: 0.5 }}>INVITE FRIENDS</Text>
              <Pressable onPress={() => setInviting(false)} hitSlop={10}><X size={20} color={C.dim} strokeWidth={2.2} /></Pressable>
            </View>
            <ScrollView>
              {friends.length === 0 ? (
                <Text style={{ fontFamily: F.body, fontSize: 13, color: C.faint, paddingVertical: 16, textAlign: 'center' }}>No friends left to invite. Share the code above instead.</Text>
              ) : friends.map((f) => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                  <Avatar url={f.avatar_url} name={f.full_name} username={f.username} size={40} />
                  <Text style={{ flex: 1, fontFamily: F.semibold, fontSize: 14, color: C.ink }} numberOfLines={1}>{f.full_name || `@${f.username}` || 'NorthStar member'}</Text>
                  <Pressable onPress={() => invite(f.id)} disabled={invited[f.id]} style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: invited[f.id] ? C.lineSoft : C.amber, borderWidth: invited[f.id] ? 1 : 0, borderColor: C.lineStrong }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 12.5, color: invited[f.id] ? C.dim : C.amberInk }}>{invited[f.id] ? 'Invited' : 'Invite'}</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Tap a member → their profile, with the option to add them as a friend
          (circle-mates aren't necessarily friends). openMember skips my own card. */}
      {viewing && <ConnectableProfileModal card={viewing} myId={myId} onClose={() => setViewing(null)} onMessage={onMessageUser ? (id) => { setViewing(null); onMessageUser(id) } : undefined} />}
    </View>
  )
}
