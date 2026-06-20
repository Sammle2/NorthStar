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
import { LinearGradient } from 'expo-linear-gradient'
import { chat } from '../jarvis'
import { fonts } from '../theme'

const QUICK_PROMPTS = ["I'm struggling today", 'I crushed my goals', 'I need motivation', 'What should I focus on?']

// Check-in conversation. Short by default; "Continue" pulls Coach deeper.
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
      {/* coach header — pulsing violet avatar, online dot */}
      <View style={[styles.header, { borderColor: colors.line }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View>
            <LinearGradient
              colors={colors.coachGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.avatar, { shadowColor: colors.violet, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }]}
            >
              <Text style={{ fontSize: 18 }}>⚡</Text>
            </LinearGradient>
            <View style={[styles.onlineDot, { backgroundColor: colors.success, borderColor: colors.bg }]} />
          </View>
          <View>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 14, letterSpacing: 2.4 }}>
              COACH
            </Text>
            <Text style={{ color: colors.success, fontSize: 11.5, marginTop: 1 }}>
              {state.user.jarvisPersonality} mode · Always here
            </Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={{ color: colors.inkDim, fontSize: 24, lineHeight: 24 }}>×</Text>
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }}>
        {messages.length === 0 && (
          <Text style={{ color: colors.inkFaint, fontSize: 14, fontStyle: 'italic' }}>
            I'm here. Tell me where you are — or just say "check in."
          </Text>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <LinearGradient
              key={i}
              colors={colors.primaryGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubble, styles.userBubble]}
            >
              <Text style={{ color: colors.primaryInk, fontSize: 14.5, lineHeight: 21 }}>{m.text}</Text>
            </LinearGradient>
          ) : (
            <View
              key={i}
              style={[styles.bubble, styles.coachBubble, { backgroundColor: colors.violetSoft, borderColor: colors.lineStrong }]}
            >
              <Text style={{ color: colors.ink, fontSize: 14.5, lineHeight: 21 }}>{m.text}</Text>
            </View>
          ),
        )}
        {busy && <ActivityIndicator color={colors.violet} style={{ alignSelf: 'flex-start', margin: 8 }} />}
        {!busy && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
          <Pressable onPress={() => send('Continue — go deeper on that.')}>
            <Text style={{ color: colors.violet, fontWeight: '700', fontSize: 13.5, marginTop: 4 }}>
              Continue →
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* quick prompts — one tap starts the honest conversation */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingBottom: 10 }}
      >
        {QUICK_PROMPTS.map((p) => (
          <Pressable
            key={p}
            onPress={() => send(p)}
            style={[styles.prompt, { backgroundColor: colors.violetSoft, borderColor: colors.lineStrong }]}
          >
            <Text style={{ color: colors.inkDim, fontSize: 12.5 }}>{p}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.inputRow, { borderColor: colors.line }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Talk to your Coach..."
          placeholderTextColor={colors.inkFaint}
          onSubmitEditing={() => send(input)}
          style={[styles.input, { color: colors.ink, backgroundColor: colors.violetSoft, borderColor: colors.lineStrong }]}
        />
        <Pressable onPress={() => send(input)} disabled={busy}>
          <LinearGradient
            colors={input.trim() ? colors.primaryGrad : [colors.raised, colors.raised]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.sendBtn, { opacity: busy ? 0.5 : 1 }]}
          >
            <Text style={{ color: input.trim() ? colors.primaryInk : colors.inkFaint, fontWeight: '800', fontSize: 16 }}>↑</Text>
          </LinearGradient>
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
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  bubble: { maxWidth: '82%', paddingVertical: 11, paddingHorizontal: 15, marginBottom: 8 },
  userBubble: { alignSelf: 'flex-end', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 4 },
  coachBubble: { alignSelf: 'flex-start', borderWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4 },
  prompt: { borderWidth: 1, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 13 },
  inputRow: { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14.5 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
})
