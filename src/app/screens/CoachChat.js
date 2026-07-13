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
import { ArrowLeft, History, Send, Settings, Trash2, X } from 'lucide-react-native'
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
  const firstName = (profile.name || '').split(' ')[0]
  const [showToneMenu, setShowToneMenu] = useState(false)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  // Past-chat history: the archive list overlay, the one session being read, and
  // which delete is armed ('ALL' or a session id) for the two-tap confirm.
  const [showHistory, setShowHistory] = useState(false)
  const [viewingSession, setViewingSession] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
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
  const SESSION_RESET_HOURS = 1
  // The watchdog waits until the user has been hands-off this long before it
  // will swap the visible thread — a reader mid-scroll never gets yanked away.
  const ACTIVITY_GRACE_MS = 2 * 60 * 1000
  // Refs so the live idle watchdog (created once, on mount) always sees the
  // CURRENT typing/draft/overlay/presence state instead of a stale snapshot.
  const isTypingRef = useRef(isTyping)
  isTypingRef.current = isTyping
  const inputRef = useRef(input)
  inputRef.current = input
  const historyOpenRef = useRef(showHistory)
  historyOpenRef.current = showHistory
  // Any touch, scroll, or keystroke on this screen stamps presence. Starts at
  // mount time — opening the tab IS an interaction.
  const lastActivityRef = useRef(Date.now())
  const stampActivity = () => { lastActivityRef.current = Date.now() }

  // End a stale session: open a fresh page, archive the ended thread so its full
  // transcript stays in History, and distill it into long-term memory. Reads
  // everything from refs, so it's safe to call from the on-open check AND the
  // live idle watchdog below. It's a no-op unless the thread has truly gone idle
  // past the window, so the once-a-minute calls just cost a couple comparisons.
  const runSessionReset = (opts) => {
    const fromWatchdog = !!(opts && opts.fromWatchdog)
    const prof = profileRef.current
    const saved = prof.coachHistory
    const lastAt = prof.coachLastChatAt
    if (!Array.isArray(saved) || saved.length < 2 || !lastAt) return
    // Never yank the thread out from under an in-flight reply or an unsent draft.
    if (isTypingRef.current || inputRef.current.trim()) return
    // The LIVE watchdog additionally defers while the user is present: reading
    // (any recent tap/scroll/keystroke) or browsing History. It re-checks every
    // minute, so the reset lands as soon as they've truly stepped away. The
    // on-open call skips these — a tab open is already a natural boundary.
    if (fromWatchdog) {
      if (historyOpenRef.current) return
      if (Date.now() - lastActivityRef.current < ACTIVITY_GRACE_MS) return
    }
    const idleMs = Date.now() - new Date(lastAt).getTime()
    if (!(idleMs > SESSION_RESET_HOURS * 3600 * 1000)) return

    const fn = (prof.name || '').split(' ')[0]
    // Start the fresh session immediately (memory-aware welcome when Nova
    // actually remembers something).
    const hasMemory = (prof.coachMemory?.facts || []).length > 0
    const reintro = hasMemory
      ? `Welcome back, ${fn} — fresh page, same me. I remember where we left off. What's on your mind?`
      : (COACH_MESSAGES[prof.coachTone]?.intro || COACH_MESSAGES.default.intro).replace('{name}', fn)
    const fresh = [{ id: '0', from: 'coach', text: reintro, time: nowTime() }]
    setMessages(fresh)
    // Archive the ENDED session so its full transcript stays viewable in History
    // (distillation only keeps the gist). Keep the last 20 sessions so the synced
    // profile blob stays bounded.
    const endedHasUser = saved.some((m) => m.from === 'user')
    onUpdate((p) => {
      const archive = Array.isArray(p.coachArchive) ? p.coachArchive : []
      const coachArchive = endedHasUser
        ? [...archive, { id: `sess_${Date.now()}`, endedAt: new Date().toISOString(), messages: saved }].slice(-20)
        : archive
      return { ...p, coachArchive, coachHistory: fresh, coachLastChatAt: new Date().toISOString() }
    })

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
  }

  // On open: a chat left idle past the window starts fresh right away.
  useEffect(() => { runSessionReset() }, [])
  // While Nova stays open: keep watching so the reset still fires ~on the hour
  // even if the user never navigates away. Checks each minute; clears on unmount.
  useEffect(() => {
    const iv = setInterval(() => runSessionReset({ fromWatchdog: true }), 60 * 1000)
    return () => clearInterval(iv)
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

  // Past chats — archived ended sessions, newest first, for the History view.
  const archive = [...(profile.coachArchive || [])].reverse()
  const sessionDateLabel = (iso) => {
    try {
      const d = new Date(iso)
      return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    } catch { return '' }
  }
  // Deleting history — remove one archived session, or wipe them all. Functional
  // updater so a concurrent write (reset, reply landing) is never clobbered. Note:
  // this only deletes the transcript — facts already distilled into Nova's memory
  // stay (erase those from Settings → Nova's Memory).
  const deleteSession = (id) => {
    onUpdate((p) => ({ ...p, coachArchive: (p.coachArchive || []).filter((s) => s.id !== id) }))
    setConfirmDeleteId(null)
    if (viewingSession?.id === id) setViewingSession(null)
  }
  const clearAllSessions = () => {
    onUpdate((p) => ({ ...p, coachArchive: [] }))
    setConfirmDeleteId(null)
    setViewingSession(null)
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      {/* onStartShouldSetResponderCapture observes every touch in the subtree
          (returning false so it never claims one) — it just stamps presence
          for the session-reset watchdog. */}
      <View
        style={{ flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' }}
        onStartShouldSetResponderCapture={() => { stampActivity(); return false }}
      >
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Past chats */}
            <Pressable
              onPress={() => { setShowHistory(true); setViewingSession(null); setConfirmDeleteId(null) }}
              hitSlop={6}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong }}
            >
              <History size={16} color={C.violet} strokeWidth={2.2} />
            </Pressable>
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
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16, gap: 16 }}
          onScroll={stampActivity}
          scrollEventThrottle={500}
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
              onChangeText={(t) => { stampActivity(); setInput(t) }}
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

        {/* Chat history — past sessions (archived when a chat resets), read-only */}
        {showHistory && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 100 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.1)' }}>
              <Pressable onPress={() => { setConfirmDeleteId(null); viewingSession ? setViewingSession(null) : setShowHistory(false) }} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineMid }}>
                {viewingSession ? <ArrowLeft size={18} color={C.dim} strokeWidth={2.2} /> : <X size={18} color={C.dim} strokeWidth={2.2} />}
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.display, fontSize: 14.5, color: C.ink, letterSpacing: 1.2 }}>{viewingSession ? 'PAST CHAT' : 'CHAT HISTORY'}</Text>
                {viewingSession ? <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint, marginTop: 2 }}>{sessionDateLabel(viewingSession.endedAt)}</Text> : null}
              </View>
              {viewingSession ? (
                <Pressable onPress={() => setConfirmDeleteId(viewingSession.id)} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }}>
                  <Trash2 size={16} color={C.red} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>

            {viewingSession ? (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 16 }}>
                {confirmDeleteId === viewingSession.id ? (
                  <View style={{ borderRadius: 14, padding: 16, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
                    <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: C.ink2, textAlign: 'center' }}>Delete this chat for good?</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                      <Pressable onPress={() => setConfirmDeleteId(null)} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong }}>
                        <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.dim }}>Keep it</Text>
                      </Pressable>
                      <Pressable onPress={() => deleteSession(viewingSession.id)} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: C.red }}>
                        <Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#fff' }}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {(viewingSession.messages || []).map((m) =>
                  m.card
                    ? <PlanCard key={m.id} card={m.card} onOpen={() => onOpenPlans && onOpenPlans(m.card.planId)} />
                    : <MessageBubble key={m.id} from={m.from} text={m.text} time={m.time} />,
                )}
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
                {archive.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 52, paddingHorizontal: 24 }}>
                    <History size={26} color={C.faint2} strokeWidth={1.8} />
                    <Text style={{ fontFamily: F.body, fontSize: 13.5, color: C.faint, marginTop: 12, textAlign: 'center', lineHeight: 20 }}>No past chats yet. When a conversation wraps up, its full transcript is saved here so you can always look back.</Text>
                  </View>
                ) : (
                  <>
                    {archive.map((s) => {
                      const users = (s.messages || []).filter((m) => m.from === 'user')
                      const preview = users[0]?.text || (s.messages || []).find((m) => m.text)?.text || 'Conversation'
                      // Armed for delete → the card flips to an inline confirm (app-wide two-tap pattern).
                      if (confirmDeleteId === s.id) {
                        return (
                          <View key={s.id} style={{ borderRadius: 14, padding: 16, marginBottom: 10, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
                            <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: C.ink2, textAlign: 'center' }}>Delete this chat for good?</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                              <Pressable onPress={() => setConfirmDeleteId(null)} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong }}>
                                <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.dim }}>Keep it</Text>
                              </Pressable>
                              <Pressable onPress={() => deleteSession(s.id)} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: C.red }}>
                                <Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#fff' }}>Delete</Text>
                              </Pressable>
                            </View>
                          </View>
                        )
                      }
                      return (
                        <Pressable key={s.id} onPress={() => { setConfirmDeleteId(null); setViewingSession(s) }} style={{ borderRadius: 14, padding: 15, marginBottom: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.violet }}>{sessionDateLabel(s.endedAt)}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint }}>{users.length} message{users.length === 1 ? '' : 's'}</Text>
                              <Pressable onPress={() => setConfirmDeleteId(s.id)} hitSlop={8} style={{ padding: 2 }}>
                                <Trash2 size={14} color={C.faint} strokeWidth={2} />
                              </Pressable>
                            </View>
                          </View>
                          <Text numberOfLines={2} style={{ fontFamily: F.body, fontSize: 13.5, color: C.ink2, lineHeight: 19 }}>{preview}</Text>
                        </Pressable>
                      )
                    })}

                    {/* Danger zone — wipe the whole history, same two-tap confirm */}
                    <View style={{ marginTop: 20 }}>
                      {confirmDeleteId === 'ALL' ? (
                        <View style={{ borderRadius: 14, padding: 16, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
                          <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: C.ink2, textAlign: 'center' }}>Delete all {archive.length} past chat{archive.length === 1 ? '' : 's'} for good?</Text>
                          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                            <Pressable onPress={() => setConfirmDeleteId(null)} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong }}>
                              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.dim }}>Keep them</Text>
                            </Pressable>
                            <Pressable onPress={clearAllSessions} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: C.red }}>
                              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#fff' }}>Delete all</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        <Pressable onPress={() => setConfirmDeleteId('ALL')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }}>
                          <Trash2 size={15} color={C.red} strokeWidth={2} />
                          <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.red }}>Delete all history</Text>
                        </Pressable>
                      )}
                    </View>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}
