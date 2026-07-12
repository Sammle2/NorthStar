import React from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Check, Lock, TrendingUp, UserPlus, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import Avatar from './Avatar'
import StreakBadge from './StreakBadge'

// A person's public profile, shown as a centered modal. What a viewer sees:
// avatar, name, @username, streak, and % to dream — plus their dream + bio when
// set. Private accounts are gated (locked) unless the viewer can see them (the
// caller passes a card with _private set when the profile row was RLS-hidden).
// Goal titles / specifics are deliberately NOT shown.
//
// Friend actions (Add / Accept / Remove) render only when `status` is provided —
// so the Friends screen gets them, and the feed opens the same card read-only.
export default function UserProfileModal({ card, status, busy, onClose, onAdd, onAccept, onRemove }) {
  const isPrivate = card._private
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,7,15,0.86)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 260 }}>
      <View style={{ width: '100%', maxWidth: 420, borderRadius: 22, padding: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.lineMid }}>
        <Pressable onPress={onClose} hitSlop={10} style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}><X size={20} color={C.dim} strokeWidth={2.2} /></Pressable>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Avatar url={card.avatar_url} name={card.full_name} username={card.username} size={88} ring />
          <Text style={{ fontFamily: F.display, fontSize: 20, color: C.ink, letterSpacing: 0.5, marginTop: 12 }}>{card.full_name || 'NorthStar member'}</Text>
          {card.username ? <Text style={{ fontFamily: F.body, fontSize: 13, color: C.violet, marginTop: 2 }}>@{card.username}</Text> : null}
          {!isPrivate && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <StreakBadge streak={card.streak || 0} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}>
                <TrendingUp size={13} color={C.violet} strokeWidth={2.4} />
                <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.violet }}>{card.dream_progress || 0}% to dream</Text>
              </View>
            </View>
          )}
        </View>
        {isPrivate ? (
          <View style={{ alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid }}>
            <Lock size={20} color={C.faint2} strokeWidth={2} />
            <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: C.dim, marginTop: 8 }}>This account is private</Text>
            <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>Add them as a friend to see their dream, streak, and progress.</Text>
          </View>
        ) : (
          <>
            {/* Goal title intentionally NOT shown — a viewer sees only streak +
                % to dream (above), the dream itself, and bio. No goal specifics. */}
            {card.dream ? <CardRow label="DREAM" value={card.dream} color={C.violet} /> : null}
            {card.bio ? <CardRow label="BIO" value={card.bio} color={C.dim} /> : null}
          </>
        )}
        {status && (
          <View style={{ marginTop: 20 }}>
            {status.kind === 'none' && <Pressable onPress={onAdd} disabled={busy} style={modalPrimary}>{busy ? <ActivityIndicator size="small" color={C.amberInk} /> : <><UserPlus size={15} color={C.amberInk} strokeWidth={2.4} /><Text style={modalPrimaryTxt}>Add friend</Text></>}</Pressable>}
            {status.kind === 'outgoing' && <Pressable onPress={() => onRemove(status.f.id)} disabled={busy} style={modalSecondary}><Text style={modalSecondaryTxt}>{busy ? 'Cancelling…' : 'Cancel request'}</Text></Pressable>}
            {status.kind === 'incoming' && <Pressable onPress={() => onAccept(status.f.id)} disabled={busy} style={modalPrimary}>{busy ? <ActivityIndicator size="small" color={C.amberInk} /> : <><Check size={15} color={C.amberInk} strokeWidth={2.6} /><Text style={modalPrimaryTxt}>Accept request</Text></>}</Pressable>}
            {status.kind === 'friends' && <Pressable onPress={() => onRemove(status.f.id)} disabled={busy} style={modalSecondary}><Text style={modalSecondaryTxt}>{busy ? 'Removing…' : 'Remove friend'}</Text></Pressable>}
          </View>
        )}
      </View>
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

const modalPrimary = { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, backgroundColor: C.amber }
const modalPrimaryTxt = { fontFamily: F.bold, fontSize: 14.5, color: C.amberInk }
const modalSecondary = { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }
const modalSecondaryTxt = { fontFamily: F.semibold, fontSize: 14, color: C.dim }
