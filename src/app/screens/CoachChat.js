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
import { MessageBubble, PlanCard, TypingDots } from '../components/ChatBits'
import { COACH_MESSAGES, coachReply, actionableTitle, normalizeAiGoal, normalizePlan } from '../aiEngine'
import { coachRespond, applyGoalAction, applyPlanAction, distillCoachMemory, generateRoadmap, generatePlan } from '../../services/aiService'
import { nowTime } from '../store'

const TONE_LABELS = { tough: 'Tough Love', gentle: 'Supportive', default: 'Balanced' }
const TONES = ['tough', 'default', 'gentle']
const QUICK = ["I'm struggling today", 'I crushed my goals', 'I need motivation', 'What should I focus on?']

let idc = 0
const nid = () => `c${Date.now()}_${idc++}`

// Screen 7 — the always-on Coach. Tone switching, quick prompts, context-aware replies.
export default function CoachChat({ profile, onUpdate, onOpenPlans }) {
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
  // it MERGES onto the latest profile (never reverts a concurrent edit). Every
  // write stamps coachLastChatAt — the session clock below runs off it.
  const persistHistory = (msgs) => {
    onUpdate((prof) => ({ ...prof, coachHistory: msgs.slice(-60), coachLastChatAt: new Date().toISOString() }))
  }

  // Chat SESSIONS, like Claude: within a session Nova sees the whole thread;
  // after this many hours of inactivity the ended conversation is distilled into
  // long-term memory and the chat opens fresh — Nova still remembers what
  // mattered, without one endless thread forever.
  const SESSION_RESET_HOURS = 12
  useEffect(() => {
    const prof = profileRef.current
    const saved = prof.coachHistory
    const lastAt = prof.coachLastChatAt
    if (!Array.isArray(saved) || saved.length < 2 || !lastAt) return
    const idleMs = Date.now() - new Date(lastAt).getTime()
    if (!(idleMs > SESSION_RESET_HOURS * 3600 * 1000)) return

    // Start the fresh session immediately (memory-aware welcome when Nova
    // actually remembers something).
    const hasMemory = (prof.coachMemory?.facts || []).length > 0
    const reintro = hasMemory
      ? `Welcome back, ${firstName} — fresh page, same me. I remember where we left off. What's on your mind?`
      : (COACH_MESSAGES[prof.coachTone]?.intro || COACH_MESSAGES.default.intro).replace('{name}', firstName)
    const fresh = [{ id: '0', from: 'coach', text: reintro, time: nowTime() }]
    setMessages(fresh)
    onUpdate((p) => ({ ...p, coachHistory: fresh, coachLastChatAt: new Date().toISOString() }))

    // Hand the ENDED session off to long-term memory in the background — only
    // the part after the last distillation watermark, so nothing is processed
    // twice and a reset-then-idle can't resurrect erased facts.
    const watermark = prof.coachMemory?.distilledAtCount || 0
    const startIdx = (() => {
      let c = 0
      for (let i = 0; i < saved.length; i++) {
        if (saved[i].from === 'user') c++
        if (c > watermark) return i
      }
      return saved.length
    })()
    const ended = saved.slice(startIdx)
    if (!ended.some((m) => m.from === 'user')) return
    ;(async () => {
      try {
        const facts = await distillCoachMemory({ profile: prof, history: ended })
        if (facts && (facts.length || !(prof.coachMemory?.facts || []).length)) {
          onUpdate((p) => ({ ...p, coachMemory: { facts, distilledAtCount: 0, updatedAt: new Date().toISOString() } }))
        }
      } catch (e) {
        console.warn('[Coach] end-of-session distill failed:', e?.message)
      }
    })()
  }, [])

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
    let planRequest = null
    try {
      const res = await coachRespond({ profile: profileRef.current, history, userText })
      reply = typeof res === 'string' ? res : res?.reply
      // NOVA may return a goal adjustment (add / edit / remove) to apply…
      action = (res && typeof res === 'object' && res.action) || null
      // …and/or a request to build a structured plan (workout, diet, study, …).
      planRequest = (res && typeof res === 'object' && res.planRequest) || null
    } catch (e) {
      console.warn('[Coach] AI reply failed, using local fallback:', e?.message)
    }
    if (!reply) reply = coachReply(profile.coachTone, userText)

    // Keep the typing indicator up THROUGH plan generation when one was requested,
    // so the input stays locked and no interim message can race the snapshot below.
    if (!planRequest) setIsTyping(false)
    const withReply = [...withUser, { id: nid(), from: 'coach', text: reply, time: nowTime() }]
    setMessages(withReply)
    // Merge over the CURRENT profile via the updater — this write may land after the
    // user has switched tabs, so it must never revert edits made meanwhile. Any goal
    // change is applied against the current goals, not the pre-send snapshot.
    onUpdate((prof) => {
      const nextGoals = action ? applyGoalAction(prof.goals, action) : null
      return { ...prof, ...(nextGoals ? { goals: nextGoals } : {}), coachHistory: withReply.slice(-60), coachLastChatAt: new Date().toISOString() }
    })
    // A chat-added goal starts as an instant local template; upgrade it in the
    // background to a Nova-built roadmap specific to that goal.
    if (action?.type === 'add' && action.title) upgradeAddedGoal(String(action.title))
    // A plan request builds the plan in the background and drops a card into the chat.
    if (planRequest) buildPlanFromRequest(planRequest, withReply)
    maybeDistill(withReply)
  }

  // Nova was asked to build a plan: generate it with the dedicated (bigger) call,
  // save it onto profile.plans via the functional updater, and drop an inline plan
  // card into the chat. The typing indicator is already up (kept on from send), and
  // the input stays locked until this resolves, so `baseMsgs` can't go stale. On any
  // failure the local template simply isn't saved and Nova says so — never blocks.
  const buildPlanFromRequest = async (planRequest, baseMsgs) => {
    let planMsg
    try {
      const raw = await generatePlan({ profile: profileRef.current, kind: planRequest.kind, brief: planRequest.brief })
      const plan = normalizePlan(raw, { kind: planRequest.kind, id: planRequest.replacePlanId || undefined })
      if (!plan.sections.length) throw new Error('empty plan')
      onUpdate((prof) => ({
        ...prof,
        plans: applyPlanAction(prof.plans, {
          type: planRequest.replacePlanId ? 'replace' : 'add',
          plan,
          planId: planRequest.replacePlanId,
        }) || prof.plans,
      }))
      const itemCount = plan.sections.reduce((n, s) => n + s.items.length, 0)
      planMsg = { id: nid(), from: 'coach', card: { planId: plan.id, title: plan.title, kind: plan.kind, sectionCount: plan.sections.length, itemCount }, time: nowTime() }
    } catch (e) {
      console.warn('[Coach] plan generation failed:', e?.message)
      planMsg = { id: nid(), from: 'coach', text: "I couldn't put that plan together just now — ask me again in a moment and I'll build it.", time: nowTime() }
    }
    setIsTyping(false)
    const next = [...baseMsgs, planMsg]
    setMessages(next)
    persistHistory(next)
  }

  // Replace a freshly-added goal's template milestones with an AI roadmap built
  // from the goal itself (specific, timeline-coherent). Fire-and-forget: on any
  // failure the local template simply stays. Never touches a goal the user has
  // already deleted or started working on.
  const upgradeAddedGoal = async (rawTitle) => {
    try {
      const prof = profileRef.current
      const ai = await generateRoadmap({ name: prof.name, rawGoal: rawTitle, tone: prof.coachTone })
      onUpdate((p) => {
        const wanted = actionableTitle(rawTitle)
        const target = (p.goals || []).find((g) => g.title === wanted && (g.progress || 0) === 0)
        if (!target) return p
        const upgraded = normalizeAiGoal(ai, rawTitle, '', target.id)
        return { ...p, goals: p.goals.map((g) => (g.id === target.id ? upgraded : g)) }
      })
    } catch (e) {
      console.warn('[Coach] AI roadmap upgrade failed, keeping local template:', e?.message)
    }
  }

  // Long-term memory: every few user turns, distill the conversation into durable
  // facts on profile.coachMemory (fire-and-forget — a failure just retries on a
  // later turn). This is how Nova remembers the user beyond the 60-message window.
  const DISTILL_EVERY = 6
  const distilling = useRef(false)
  const maybeDistill = async (msgs, force = false) => {
    const prof = profileRef.current
    const userCount = msgs.filter((m) => m.from === 'user').length
    const watermark = prof.coachMemory?.distilledAtCount || 0
    if (distilling.current || (!force && userCount - watermark < DISTILL_EVERY)) return
    // Only feed the conversation AFTER the watermark: nothing is processed twice,
    // and a "Reset chat memories" (which parks the watermark at the current
    // position) can never resurrect erased facts from older messages.
    const startIdx = (() => {
      let c = 0
      for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].from === 'user') c++
        if (c > watermark) return i
      }
      return msgs.length
    })()
    const freshSlice = msgs.slice(startIdx)
    if (!freshSlice.some((m) => m.from === 'user')) return // nothing new to learn from
    distilling.current = true
    try {
      const facts = await distillCoachMemory({ profile: prof, history: freshSlice })
      // Never let an empty result WIPE existing memory — the model merges old +
      // new, so empty is only trustworthy when there was nothing there before.
      if (facts && (facts.length || !(prof.coachMemory?.facts || []).length)) {
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
    onUpdate((prof) => ({ ...prof, coachTone: tone, coachHistory: next.slice(-60), coachLastChatAt: new Date().toISOString() }))
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
          {messages.map((m) =>
            m.card ? (
              <PlanCard key={m.id} card={m.card} onOpen={() => onOpenPlans && onOpenPlans(m.card.planId)} />
            ) : (
              <MessageBubble key={m.id} from={m.from} text={m.text} time={m.time} />
            ),
          )}
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
