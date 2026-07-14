import React, { useState } from 'react'
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native'
import { Check, Lock, MessageCircle, TrendingUp, UserPlus, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import Avatar from './Avatar'
import StreakBadge from './StreakBadge'
import { liveStreakOf } from '../store'

// A person's public profile, shown as a centered modal. What a viewer sees:
// avatar, name, @username, streak, and % to dream — plus their dream + bio when
// set. PRIVATE accounts are locked down to name + avatar + the friend action
// unless the viewer is an ACCEPTED friend: no dream, streak, or % to dream. The
// lock applies both when the profile row was RLS-hidden (card._private) and when
// it was readable (e.g. they have public posts) but marked visibility:'private'.
// Goal titles / specifics are deliberately NOT shown to anyone.
//
// Friend actions (Add / Accept / Remove) render only when `status` is provided —
// so the Friends screen gets them, and the feed opens the same card read-only.
export default function UserProfileModal({ card, status, statusLoading, busy, onClose, onAdd, onAccept, onRemove, onMessage }) {
  // The full dream can be long — tap the DREAM row to read all of it.
  const [dreamOpen, setDreamOpen] = useState(false)
  const isFriend = status?.kind === 'friends'
  const isPrivate = card._private || (card.visibility === 'private' && !isFriend)
  // A PRIVATE (but readable) card whose relationship is still loading gets a
  // NEUTRAL body: showing stats could leak to a stranger, and showing the lock
  // (with Add friend) mislabels an actual friend. Wait until we know.
  const relationshipPending = !!statusLoading && !isFriend && !card._private && card.visibility === 'private'
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,7,15,0.86)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 260 }}>
      <View style={{ width: '100%', maxWidth: 420, borderRadius: 22, padding: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.lineMid }}>
        <Pressable onPress={onClose} hitSlop={10} style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}><X size={20} color={C.dim} strokeWidth={2.2} /></Pressable>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Avatar url={card.avatar_url} name={card.full_name} username={card.username} size={88} ring />
          <Text style={{ fontFamily: F.display, fontSize: 20, color: C.ink, letterSpacing: 0.5, marginTop: 12 }}>{card.full_name || 'NorthStar member'}</Text>
          {card.username ? <Text style={{ fontFamily: F.body, fontSize: 13, color: C.violet, marginTop: 2 }}>@{card.username}</Text> : null}
          {!isPrivate && !relationshipPending && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <StreakBadge streak={liveStreakOf(card.streak, card.last_check_in)} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}>
                <TrendingUp size={13} color={C.violet} strokeWidth={2.4} />
                <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.violet }}>{card.dream_progress || 0}% to dream</Text>
              </View>
            </View>
          )}
        </View>
        {relationshipPending ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <ActivityIndicator size="small" color={C.faint} />
          </View>
        ) : isPrivate ? (
          <View style={{ alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid }}>
            <Lock size={20} color={C.faint2} strokeWidth={2} />
            <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: C.dim, marginTop: 8 }}>This account is private</Text>
            <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>Add them as a friend to see their dream, streak, and progress.</Text>
          </View>
        ) : (
          <>
            {/* Goal title intentionally NOT shown — a viewer sees only streak +
                % to dream (above), the dream itself, and bio. No goal specifics.
                The dream row expands on tap so a long dream can be read in full. */}
            {card.dream ? (
              <CardRow
                label="DREAM"
                value={card.dream}
                color={C.violet}
                expandable
                expanded={dreamOpen}
                onToggle={() => setDreamOpen((v) => !v)}
              />
            ) : null}
            {card.bio ? <CardRow label="BIO" value={card.bio} color={C.dim} /> : null}
          </>
        )}
        {status && !relationshipPending && (
          <View style={{ marginTop: 20 }}>
            {status.kind === 'none' && <Pressable onPress={onAdd} disabled={busy} style={modalPrimary}>{busy ? <ActivityIndicator size="small" color={C.amberInk} /> : <><UserPlus size={15} color={C.amberInk} strokeWidth={2.4} /><Text style={modalPrimaryTxt}>Add friend</Text></>}</Pressable>}
            {status.kind === 'outgoing' && <Pressable onPress={() => onRemove(status.f.id)} disabled={busy} style={modalSecondary}><Text style={modalSecondaryTxt}>{busy ? 'Cancelling…' : 'Cancel request'}</Text></Pressable>}
            {status.kind === 'incoming' && <Pressable onPress={() => onAccept(status.f.id)} disabled={busy} style={modalPrimary}>{busy ? <ActivityIndicator size="small" color={C.amberInk} /> : <><Check size={15} color={C.amberInk} strokeWidth={2.6} /><Text style={modalPrimaryTxt}>Accept request</Text></>}</Pressable>}
            {status.kind === 'friends' && (
              <>
                {onMessage && (
                  <Pressable onPress={onMessage} style={[modalPrimary, { marginBottom: 10 }]}>
                    <MessageCircle size={15} color={C.amberInk} strokeWidth={2.4} />
                    <Text style={modalPrimaryTxt}>Message</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => onRemove(status.f.id)} disabled={busy} style={modalSecondary}><Text style={modalSecondaryTxt}>{busy ? 'Removing…' : 'Remove friend'}</Text></Pressable>
              </>
            )}
          </View>
        )}
      </View>
    </View>
  )
}

function CardRow({ label, value, color, expandable, expanded, onToggle }) {
  // "Show more" only when the 3-line clamp actually cut something off. On web
  // the clamp is -webkit-line-clamp, so overflow is measurable on the DOM node;
  // native (not shipped) falls back to a length heuristic.
  const [clipped, setClipped] = useState(Platform.OS !== 'web' && (value || '').length > 100)
  const measure = (node) => {
    if (!node || !expandable || Platform.OS !== 'web') return
    requestAnimationFrame(() => {
      try { if (!expanded) setClipped(node.scrollHeight > node.clientHeight + 1) } catch {}
    })
  }
  const body = (
    <>
      <Text style={{ fontFamily: F.display, fontSize: 9.5, color: C.faint, letterSpacing: 1.6, marginBottom: 4 }}>{label}</Text>
      <Text ref={expandable ? measure : undefined} style={{ fontFamily: F.body, fontSize: 13.5, color: C.ink2, lineHeight: 19 }} numberOfLines={expandable && expanded ? undefined : 3}>{value}</Text>
      {expandable && (expanded || clipped) ? (
        <Text style={{ fontFamily: F.semibold, fontSize: 11.5, color: C.violet, marginTop: 6 }}>{expanded ? 'Show less' : 'Show more'}</Text>
      ) : null}
      <View style={{ height: 2, width: 26, borderRadius: 2, backgroundColor: color, marginTop: 8, opacity: 0.6 }} />
    </>
  )
  // Expandable rows (the dream) toggle between the 3-line preview and full text.
  if (expandable) return <Pressable onPress={onToggle} style={{ marginTop: 14 }}>{body}</Pressable>
  return <View style={{ marginTop: 14 }}>{body}</View>
}

const modalPrimary = { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, backgroundColor: C.amber }
const modalPrimaryTxt = { fontFamily: F.bold, fontSize: 14.5, color: C.amberInk }
const modalSecondary = { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }
const modalSecondaryTxt = { fontFamily: F.semibold, fontSize: 14, color: C.dim }
