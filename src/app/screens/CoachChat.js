import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Send, Settings } from 'lucide-react-native'
import { C, F } from '../tokens'
import CoachAvatar from '../components/CoachAvatar'
import { MessageBubble, TypingDots } from '../components/ChatBits'
import { COACH_MESSAGES, coachReply } from '../aiEngine'
import { coachRespond, applyGoalAction, distillCoachMemory } from '../../services/aiService'
import { nowTime } from '../store'

const TONE_LABELS = { tough: 'Tough Love', gentle: 'Supportive', default: 'Balanced' }
const TONES = ['tough', 'default', 'gentle']
const QUICK = ["I'm struggling today", 'I crushed my goals', 'I need motivation', 'What should I focus on?']

let idc = 0
const nid = () => `c${Date.now()}_${idc++}`

// Screen 7 — the always-on Coach. Tone switching, quick prompts, context-aware replies.
export default function CoachChat({ profile, onUpdate }) {
  const firstName = profile.name.split(' ')[0]
  const [showToneMenu, setShowToneMenu] = useState(false)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const profileRef = useRef(profile)
  profileRef.current = profile

  const [messages, setMessages] = useState(() => {
    // NOVA remembers: resume the saved conversation if there is one…
    const saved = profile.coachHistory
    if (Array.isArray(saved) && saved.length) return saved
    // …otherwise open with a SINGLE welcome text. No immediate quick check — that
    // check-in now arrives as the daily 1pm notification instead.
    const intro = (COACH_MESSAGES[profile.coachTone]?.intro || COACH_MESSAGES.default.intro)
      .replace('{name}', firstName)
    return [{ id: '0', from: 'coach', text: intro, time: nowTime() }]
  })
  const scrollRef = useRef(null)

  // Persist the conversation onto the profile (capped) so NOVA's memory survives
  // tab switches, reloads, and syncs to the cloud. Uses the functional updater so
  // it MERGES onto the latest profile (never reverts a concurrent edit).
  const persistHistory = (msgs) => {
    onUpdate((prof) => ({ ...prof, coachHistory: msgs.slice(-60) }))
  }

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
  }, [messages, isTyping])

  const send = async (textArg) => {
    const userText = (textArg ?? input).trim()
    // Guard on isTyping: no overlapping sends while a reply is in flight. This keeps
    // the message list single-threaded, so the snapshot arrays below can't drop a
    // concurrently-added message.
    if (!userText || isTyping) return
    setInput('')
    const history = messages // snapshot before adding the new turn (for AI context)
    const withUser = [...messages, { id: nid(), from: 'user', text: userText, time: nowTime() }]
    setMessages(withUser)
    persistHistory(withUser)
    setIsTyping(true)

    // Personalized reply from Claude (tone + dream + goal + streak aware, and now
    // able to adjust goals), with a local fallback so the Coach always answers even
    // offline / without a key.
    let reply
    let action = null
    try {
      const res = await coachRespond({ profile: profileRef.current, history, userText })
      reply = typeof res === 'string' ? res : res?.reply
      // NOVA may return a goal adjustment (add / edit / remove) to apply.
      action = (res && typeof res === 'object' && res.action) || null
    } catch (e) {
      console.warn('[Coach] AI reply failed, using local fallback:', e?.message)
    }
    if (!reply) reply = coachReply(profile.coachTone, userText)

    setIsTyping(false)
    const withReply = [...withUser, { id: nid(), from: 'coach', text: reply, time: nowTime() }]
    setMessages(withReply)
    // Merge over the CURRENT profile via the updater — this write may land after the
    // user has switched tabs, so it must never revert edits made meanwhile. Any goal
    // change is applied against the current goals, not the pre-send snapshot.
    onUpdate((prof) => {
      const nextGoals = action ? applyGoalAction(prof.goals, action) : null
      return { ...prof, ...(nextGoals ? { goals: nextGoals } : {}), coachHistory: withReply.slice(-60) }
    })
    maybeDistill(withReply)
  }

  // Long-term memory: every few user turns, distill the conversation into durable
  // facts on profile.coachMemory (fire-and-forget — a failure just retries on a
  // later turn). This is how Nova remembers the user beyond the 60-message window.
  const DISTILL_EVERY = 6
  const distilling = useRef(false)
  const maybeDistill = async (msgs, force = false) => {
    const prof = profileRef.current
    const userCount = msgs.filter((m) => m.from === 'user').length
    const lastAt = prof.coachMemory?.distilledAtCount || 0
    if (distilling.current || (!force && userCount - lastAt < DISTILL_EVERY)) return
    distilling.current = true
    try {
      const facts = await distillCoachMemory({ profile: prof, history: msgs })
      if (facts) {
        onUpdate((p) => ({
          ...p,
          coachMemory: { facts, distilledAtCount: userCount, updatedAt: new Date().toISOString() },
        }))
      }
    } finally {
      distilling.current = false
    }
  }
  // Dev-only hook so tooling can force a distillation pass from the console.
  if (__DEV__ && Platform.OS === 'web' && typeof window !== 'undefined') {
    window.__nsDistillNow = () => maybeDistill(messages, true)
  }

  const changeTone = (tone) => {
    if (isTyping) return
    setShowToneMenu(false)
    const next = [...messages, { id: nid(), from: 'coach', text: COACH_MESSAGES[tone].toneConfirm, time: nowTime() }]
    setMessages(next)
    onUpdate((prof) => ({ ...prof, coachTone: tone, coachHistory: next.slice(-60) }))
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 24,
            paddingTop: 56,
            paddingBottom: 18,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(167,139,250,0.1)',
            zIndex: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <CoachAvatar size={46} />
            <View>
              <Text style={{ fontFamily: F.display, fontSize: 14.5, color: C.ink, letterSpacing: 1.4 }}>
              {(profile.coachName || 'Nova').toUpperCase()}
            </Text>
              <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.green, marginTop: 2 }}>
                {TONE_LABELS[profile.coachTone]} mode · Always here
              </Text>
            </View>
          </View>

          <View>
            <Pressable
              onPress={() => setShowToneMenu((s) => !s)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: C.lineSoft,
                borderWidth: 1,
                borderColor: C.lineStrong,
              }}
            >
              <Settings size={14} color={C.violet} strokeWidth={2.2} />
              <Text style={{ fontFamily: F.body, fontSize: 12, color: C.violet }}>Tone</Text>
            </Pressable>

            {showToneMenu && (
              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 42,
                  minWidth: 160,
                  borderRadius: 12,
                  overflow: 'hidden',
                  backgroundColor: C.card,
                  borderWidth: 1,
                  borderColor: C.lineStrong,
                  shadowColor: '#000',
                  shadowOpacity: 0.6,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: 16 },
                  zIndex: 50,
                }}
              >
                {TONES.map((t) => {
                  const on = profile.coachTone === t
                  return (
                    <Pressable
                      key={t}
                      onPress={() => changeTone(t)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        backgroundColor: on ? C.violetFill : 'transparent',
                        borderBottomWidth: 1,
                        borderBottomColor: 'rgba(167,139,250,0.06)',
                      }}
                    >
                      <Text style={{ fontFamily: F.body, fontSize: 13.5, color: on ? C.violet : C.dim }}>{TONE_LABELS[t]}</Text>
                      {on && <Text style={{ marginLeft: 'auto', fontSize: 11, color: C.violet }}>✓</Text>}
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16, gap: 16 }}
        >
          {messages.map((m) => (
            <MessageBubble key={m.id} from={m.from} text={m.text} time={m.time} />
          ))}
          {isTyping && <TypingDots />}
        </ScrollView>

        {/* Quick prompts + input — lifted clear of the bottom tab bar */}
        <View style={{ paddingBottom: 96 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}
          >
            {QUICK.map((q) => (
              <Pressable
                key={q}
                onPress={() => setInput(q)}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: C.violetFill07,
                  borderWidth: 1,
                  borderColor: C.lineMid,
                }}
              >
                <Text style={{ fontFamily: F.body, fontSize: 12, color: C.dim }}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => send()}
              placeholder="Talk to Nova..."
              placeholderTextColor={C.faint2}
              returnKeyType="send"
              style={{
                flex: 1,
                backgroundColor: C.lineSoft,
                borderWidth: 1,
                borderColor: C.lineStrong,
                borderRadius: 14,
                paddingVertical: 13,
                paddingHorizontal: 18,
                fontFamily: F.body,
                fontSize: 14.5,
                color: C.ink,
              }}
            />
            <Pressable onPress={() => send()} disabled={!input.trim() || isTyping}>
              {input.trim() && !isTyping ? (
                <LinearGradient
                  colors={[C.amber, C.amberDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Send size={18} color={C.amberInk} strokeWidth={2.2} />
                </LinearGradient>
              ) : (
                <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <Send size={18} color={C.faint2} strokeWidth={2.2} />
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
