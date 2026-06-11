import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { chat } from '../jarvis'
import { Kicker } from '../components/Ui'

// Check-in conversation. Short by default; "Continue" pulls Jarvis deeper.
export default function CheckIn({ state, colors, onClose, onAppendChat }) {
  const [messages, setMessages] = useState(state.chat.slice(-30))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80)
  }, [messages, busy])

  async function send(text) {
    if (!text.trim() || busy) return
    setInput('')
    const next = [...messages, { role: 'user', text }]
    setMessages(next)
    onAppendChat({ role: 'user', text })
    setBusy(true)
    const reply = await chat(state, next)
    setMessages((m) => [...m, { role: 'assistant', text: reply }])
    onAppendChat({ role: 'assistant', text: reply })
    setBusy(false)
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, { backgroundColor: colors.bg }]}
    >
      <View style={styles.header}>
        <Kicker colors={colors}>Check-in with Jarvis</Kicker>
        <Pressable onPress={onClose}>
          <Text style={{ color: colors.inkDim, fontSize: 22, lineHeight: 22 }}>×</Text>
        </Pressable>
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }}>
        {messages.length === 0 && (
          <Text style={{ color: colors.inkFaint, fontSize: 14, fontStyle: 'italic' }}>
            I’m here. Tell me where you are — or just say “check in.”
          </Text>
        )}
        {messages.map((m, i) => (
          <View
            key={i}
            style={[
              styles.bubble,
              m.role === 'user'
                ? { alignSelf: 'flex-end', backgroundColor: colors.electric }
                : { alignSelf: 'flex-start', backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.lineStrong },
            ]}
          >
            <Text style={{ color: m.role === 'user' ? '#fff' : colors.ink, fontSize: 14.5, lineHeight: 21 }}>
              {m.text}
            </Text>
          </View>
        ))}
        {busy && <ActivityIndicator color={colors.glow} style={{ alignSelf: 'flex-start', margin: 8 }} />}
        {!busy && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
          <Pressable onPress={() => send('Continue — go deeper on that.')}>
            <Text style={{ color: colors.glow, fontWeight: '700', fontSize: 13.5, marginTop: 4 }}>
              Continue →
            </Text>
          </Pressable>
        )}
      </ScrollView>
      <View style={[styles.inputRow, { borderColor: colors.line }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="How are you doing, really?"
          placeholderTextColor={colors.inkFaint}
          onSubmitEditing={() => send(input)}
          style={[styles.input, { color: colors.ink, backgroundColor: colors.raised, borderColor: colors.lineStrong }]}
        />
        <Pressable
          onPress={() => send(input)}
          style={[styles.sendBtn, { backgroundColor: colors.electric, opacity: busy ? 0.5 : 1 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8 },
  inputRow: { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14.5 },
  sendBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
})
