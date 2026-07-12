import React, { useEffect, useState } from 'react'
import UserProfileModal from './UserProfileModal'
import { getFriendships, sendFriendRequest, acceptFriendRequest, removeFriendship } from '../../services/socialService'

// UserProfileModal + live friend actions. Use this wherever you can tap on a
// person who might not be your friend yet — the feed, a circle's stats board —
// so the popup can add them (or accept/cancel/remove, based on the current
// relationship). It never offers an action on your OWN card: callers already
// avoid opening it for yourself, and statusFor double-guards on myId.
export default function ConnectableProfileModal({ card, myId, onClose, onChanged }) {
  const [friendships, setFriendships] = useState(null) // null until loaded
  const [busy, setBusy] = useState(false)

  const load = async () => setFriendships(await getFriendships())
  useEffect(() => { load() }, [])

  // Same mapping AddFriends uses. Returns undefined (→ no button) for yourself
  // or while the friendships are still loading.
  const statusFor = (userId) => {
    if (!userId || userId === myId || !friendships) return undefined
    const f = friendships.find((x) => x.requester_id === userId || x.addressee_id === userId)
    if (!f) return { kind: 'none' }
    if (f.status === 'accepted') return { kind: 'friends', f }
    if (f.addressee_id === myId) return { kind: 'incoming', f }
    return { kind: 'outgoing', f }
  }

  const after = async () => { await load(); onChanged?.() }
  const add = async () => { setBusy(true); await sendFriendRequest(card.id, myId); await after(); setBusy(false) }
  const accept = async (fid) => { setBusy(true); await acceptFriendRequest(fid); await after(); setBusy(false) }
  const remove = async (fid) => { setBusy(true); await removeFriendship(fid); await after(); setBusy(false) }

  return (
    <UserProfileModal
      card={card}
      status={statusFor(card?.id)}
      busy={busy}
      onClose={onClose}
      onAdd={add}
      onAccept={accept}
      onRemove={remove}
    />
  )
}
