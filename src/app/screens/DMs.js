import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { ArrowLeft, Check, PenSquare, Send, Users, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import Avatar from '../components/Avatar'
import { getConversations, getMessages, sendMessage, openDm, createGroup } from '../../services/dmService'
import { getFriendships, getIdentities } from '../../services/socialService'

// Messages — conversation list, 1:1 and group threads, and starting new chats.
export default function DMs({ profile, onClose }) {
  const myId = profile.userId
  const [view, setView] = useState('list') // list | thread | new
  const [convos, setConvos] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null) // { id, title, others }
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [friends, setFriends] = useState([])
  const [picked, setPicked] = useState([])
  const [groupTitle, setGroupTitle] = useState('')
  const [starting, setStarting] = useState(false)

  const loadConvos = async () => { setConvos(await getConversations(myId)); setLoading(false) }
  useEffect(() => { loadConvos() }, [])

  const openThread = async (conv) => {
    setActive(conv)
    setView('thread')
    setMessages(await getMessages(conv.id))
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || !active) return
    setSending(true)
    setDraft('')
    await sendMessage(active.id, myId, text)
    setMessages(await getMessages(active.id))
    setSending(false)
  }

  const openNew = async () => {
    setView('new'); setPicked([]); setGroupTitle('')
    const fs = await getFriendships()
    const ids = fs.filter((f) => f.status === 'accepted').map((f) => (f.requester_id === myId ? f.addressee_id : f.requester_id))
    setFriends(await getIdentities(ids))
  }

  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const startChat = async () => {
    if (!picked.length) return
    setStarting(true)
    let convId
    if (picked.length === 1) {
      const { conversationId } = await openDm(picked[0])
      convId = conversationId
    } else {
      const { conversationId } = await createGroup(groupTitle, picked, myId)
      convId = conversationId
    }
    setStarting(false)
    if (!convId) return
    await loadConvos()
    const fresh = await getConversations(myId)
    const conv = fresh.find((c) => c.id === convId)
    if (conv) openThread(conv)
  }

  const titleOf = (c) => c.isGroup ? (c.title || 'Group') : (c.others[0]?.full_name || c.others[0]?.username || 'Conversation')

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 240 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
          {view === 'list' ? (
            <Pressable onPress={onClose} hitSlop={10}><X size={22} color={C.dim} strokeWidth={2.2} /></Pressable>
          ) : (
            <Pressable onPress={() => setView('list')} hitSlop={10}><ArrowLeft size={22} color={C.dim} strokeWidth={2.2} /></Pressable>
          )}
          <Text style={{ flex: 1, fontFamily: F.display, fontSize: 18, color: C.ink, letterSpacing: 1 }}>
            {view === 'thread' ? titleOf(active).toUpperCase() : view === 'new' ? 'NEW MESSAGE' : 'MESSAGES'}
          </Text>
          {view === 'list' && (
            <Pressable onPress={openNew} hitSlop={10}><PenSquare size={20} color={C.violet} strokeWidth={2.2} /></Pressable>
          )}
        </View>

        {view === 'list' && (
          <ScrollView contentContainerStyle={{ padding: 8, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
            {loading ? <ActivityIndicator size="small" color={C.faint} style={{ marginTop: 24 }} /> : convos.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 }}>
                <Users size={28} color={C.faint2} strokeWidth={1.8} />
                <Text style={{ fontFamily: F.body, fontSize: 13.5, color: C.faint, marginTop: 12, textAlign: 'center', lineHeight: 20 }}>No messages yet. Tap the pencil to start a chat with a friend or a group.</Text>
              </View>
            ) : convos.map((c) => (
              <Pressable key={c.id} onPress={() => openThread(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14 }}>
                {c.isGroup
                  ? <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}><Users size={20} color={C.violet} strokeWidth={2} /></View>
                  : <Avatar url={c.others[0]?.avatar_url} name={c.others[0]?.full_name} username={c.others[0]?.username} size={48} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.ink }} numberOfLines={1}>{titleOf(c)}</Text>
                  <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.faint, marginTop: 2 }} numberOfLines={1}>{c.lastMessage || 'No messages yet'}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {view === 'thread' && active && (
          <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, maxWidth: 600, width: '100%', alignSelf: 'center', flexGrow: 1, justifyContent: 'flex-end' }}>
              {messages.map((m) => {
                const mine = m.sender_id === myId
                return (
                  <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', marginVertical: 4, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: mine ? C.amber : C.card, borderWidth: mine ? 0 : 1, borderColor: C.lineMid }}>
                    <Text style={{ fontFamily: F.body, fontSize: 14.5, color: mine ? C.amberInk : C.ink, lineHeight: 20 }}>{m.content}</Text>
                  </View>
                )
              })}
              {messages.length === 0 && <Text style={{ fontFamily: F.body, fontSize: 13, color: C.faint, textAlign: 'center', paddingVertical: 24 }}>Say hi 👋</Text>}
            </ScrollView>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
              <TextInput value={draft} onChangeText={setDraft} placeholder="Message…" placeholderTextColor={C.faint2} style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11 }} onSubmitEditing={send} />
              <Pressable onPress={send} disabled={sending || !draft.trim()} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: draft.trim() ? C.amber : C.lineSoft }}>
                <Send size={18} color={draft.trim() ? C.amberInk : C.faint2} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>
        )}

        {view === 'new' && (
          <ScrollView contentContainerStyle={{ padding: 20, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
            {picked.length >= 2 && (
              <TextInput value={groupTitle} onChangeText={setGroupTitle} placeholder="Group name (optional)" placeholderTextColor={C.faint2} style={{ fontFamily: F.body, fontSize: 15, color: C.ink, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 16 }} />
            )}
            <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 3, marginBottom: 12 }}>CHOOSE FRIENDS</Text>
            {friends.length === 0 ? (
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.faint, textAlign: 'center', paddingVertical: 16 }}>Add friends first to start a chat.</Text>
            ) : friends.map((f) => {
              const on = picked.includes(f.id)
              return (
                <Pressable key={f.id} onPress={() => togglePick(f.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }}>
                  <Avatar url={f.avatar_url} name={f.full_name} username={f.username} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: C.ink }}>{f.full_name || 'NorthStar member'}</Text>
                    {f.username ? <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 1 }}>@{f.username}</Text> : null}
                  </View>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? C.amber : C.faint3, backgroundColor: on ? C.amber : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Check size={14} color={C.amberInk} strokeWidth={3} />}
                  </View>
                </Pressable>
              )
            })}
            {picked.length > 0 && (
              <Pressable onPress={startChat} disabled={starting} style={{ marginTop: 20, borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: C.amber }}>
                {starting && <ActivityIndicator size="small" color={C.amberInk} />}
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>{picked.length === 1 ? 'Message' : `Create group (${picked.length})`}</Text>
              </Pressable>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  )
}
