import React, { useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native'
import { C, F } from '../tokens'
import CoachAvatar from '../components/CoachAvatar'
import GlowProgress from '../components/GlowProgress'
import { MessageBubble, TypingDots } from '../components/ChatBits'
import {
  COACH_MESSAGES,
  CURRENT_LEVELS,
  CURRENT_QUESTIONS,
  DESIRE_LEVELS,
  FUTURE_QUESTIONS,
  actionableTitle,
  buildGoal,
  capName,
  deriveDomainSignals,
  dreamFocus,
  generateDreamStory,
  normalizeAiGoal,
  validateGoal,
} from '../aiEngine'
import { generateDreamLifeStory, generateRoadmap, refineCommitments } from '../../services/aiService'

const TONES = [
  { id: 'tough', label: 'Tough Love', desc: 'No BS, high expectations', emoji: '💪' },
  { id: 'default', label: 'Balanced', desc: 'Honest and encouraging', emoji: '⚡' },
  { id: 'gentle', label: 'Supportive', desc: 'Warm, patient, kind', emoji: '🌱' },
]
const GENDERS = ['Male', 'Female', 'Prefer not to say']

let idc = 0
const nid = () => `m${Date.now()}_${idc++}`

// Build the shared AI grounding from both intake sections — the ratings + notes
// that the commitment refinement, the roadmaps, and the future-vision all draw
// on. Also derives the dream descriptor (their strongest desires + who they want
// to become) and the `extra` free-text that doubles as dreamDescription.
const buildIntakeContext = (current, future) => {
  const { answers, satisfaction } = deriveDomainSignals(current, future)
  const focus = dreamFocus(answers, satisfaction)

  const noteLines = []
  CURRENT_QUESTIONS.forEach((q) => {
    const n = (current?.[q.key]?.note || '').trim()
    if (n) noteLines.push(`${q.label} (today): ${n}`)
  })
  FUTURE_QUESTIONS.forEach((q) => {
    const n = (future?.[q.key]?.note || '').trim()
    if (n) noteLines.push(`${q.label}: ${n}`)
  })
  const extra = noteLines.join('\n').slice(0, 1200)

  const fmt = (qs, map) => qs.map((q) => {
    const e = map?.[q.key] || {}
    const note = (e.note || '').trim()
    return `- ${q.label}: ${e.rating || '?'} of 4${note ? ` — "${note}"` : ''}`
  })
  const situation = [
    'Where they are today (1 = very low, 4 = very strong):',
    ...fmt(CURRENT_QUESTIONS, current),
    "Where they're going (1 = not important, 4 = core desire):",
    ...fmt(FUTURE_QUESTIONS, future),
  ].join('\n').slice(0, 2000)

  // A short dream anchor: who they want to become + the desires they marked
  // as core (rating 4) — used to ground the commitment refinement and story.
  const identity = (future?.identity?.note || '').trim()
  const core = FUTURE_QUESTIONS
    .filter((q) => Number(future?.[q.key]?.rating) >= 4)
    .map((q) => q.label.replace(/^Desired /i, '').toLowerCase())
    .slice(0, 3)
  const dream = [identity, core.length ? `craving ${core.join(', ')}` : ''].filter(Boolean).join(' — ')

  return { answers, satisfaction, focus, extra, situation, dream }
}

// Screen 2 — the Coach's first conversation: intake form (incl. picking a
// username + email for new accounts) → "Where I Am" (8 × 1–4 + optional note)
// → "Where I'm Going" (8 × 1–4 + optional note) → three commitments Nova
// elevates into overarching SMART goals → tone → generate.
export default function Onboarding({ onComplete, onClaimAccount, hasAccount, onBack }) {
  const [messages, setMessages] = useState([])
  const [step, setStep] = useState('intake') // intake | current | future | goal | tone | generating
  const [isTyping, setIsTyping] = useState(false)
  const [toneSelected, setToneSelected] = useState(false)
  const [progress, setProgress] = useState(0)
  const data = useRef({ name: '', age: '', gender: '', username: '', email: '', current: {}, future: {}, rawCommitments: [], refined: [] })
  const scrollRef = useRef(null)

  const addCoach = (text, delay = 700) =>
    new Promise((resolve) => {
      setIsTyping(true)
      setTimeout(() => {
        setIsTyping(false)
        setMessages((p) => [...p, { id: nid(), from: 'coach', text }])
        resolve()
      }, delay)
    })
  const addUser = (text) => setMessages((p) => [...p, { id: nid(), from: 'user', text }])

  useEffect(() => {
    addCoach(COACH_MESSAGES.default.welcome.replace('{coach}', 'Nova'), 800)
  }, [])
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
  }, [messages, isTyping, step])

  const submitIntake = async ({ name, age, gender, username, email, password }) => {
    const capped = capName(name)
    // The password is passed straight through to account creation — never kept
    // in the intake data.
    data.current = { ...data.current, name: capped, age, gender, username: username || '', email: email || '' }

    // New account: claim the username + email + password now. If it fails
    // (email taken, username collision, offline), surface the error and stay.
    if (!hasAccount && onClaimAccount) {
      const err = await onClaimAccount({ username, email, password, name: capped })
      if (err) return err // IntakeForm shows it inline
    }

    addUser(`${capped} · ${age} · ${gender}${username ? ` · @${username}` : ''}`)
    setStep('current')
    await addCoach(COACH_MESSAGES.default.dreamIntro, 1000)
    return null
  }

  const submitCurrent = async (current) => {
    data.current = { ...data.current, current }
    addUser('Mapped where I am')
    setStep('future')
    await addCoach(COACH_MESSAGES.default.futureIntro, 900)
  }

  const submitFuture = async (future) => {
    data.current = { ...data.current, future }
    addUser('Mapped where I want to go')
    setStep('goal')
    await addCoach(COACH_MESSAGES.default.goalPrompt, 1200)
  }

  // The three commitments → Nova elevates each into an overarching SMART goal.
  // Returns an error STRING to the card (kept editable) when they need another
  // pass, or null on success (the step advances to tone). Fails open: an API
  // hiccup shapes the raw commitments locally rather than blocking onboarding.
  const submitCommitments = async (rawGoals) => {
    const rejected = data.current.commitmentAttempts || []

    // Fast local pre-filter each — catches empty/gibberish/impossible offline.
    for (let i = 0; i < rawGoals.length; i++) {
      const check = validateGoal(rawGoals[i])
      if (!check.ok) return `Commitment ${i + 1}: ${check.clarify}`
    }

    addUser(rawGoals.map((g, i) => `${i + 1}. ${g}`).join('\n'))
    setIsTyping(true)
    const ctx = buildIntakeContext(data.current.current, data.current.future)
    const res = await refineCommitments({
      name: data.current.name,
      rawGoals,
      dream: ctx.dream,
      situation: ctx.situation,
      tone: 'default',
      attempt: rejected.length + 1,
      rejected,
    })
    setIsTyping(false)

    // Nova sent one back — keep the card editable and show why.
    if (res && res.ok === false) {
      data.current = { ...data.current, commitmentAttempts: [...rejected, ...rawGoals] }
      return res.message || "One of those isn't quite a goal we can build yet — make it a little more concrete and overarching."
    }

    // Success, or fail-open (res === null → shape the raw commitments locally so
    // onboarding never stalls on an API error).
    const refined = res && res.ok && res.goals.length
      ? res.goals
      : rawGoals.map((g) => ({ title: actionableTitle(g), category: '', timeframeMonths: 6, rootAction: g }))
    data.current = { ...data.current, rawCommitments: rawGoals, refined }

    const titles = refined.map((r, i) => `${i + 1}. ${r.title}`).join('\n')
    await addCoach(`Here's what I'm hearing — three commitments we can build:\n\n${titles}\n\nEach one is an overarching goal, sized to the next few months. Last thing: how do you want me to coach you?`, 1100)
    setStep('tone')
    return null
  }

  const handleTone = async (tone) => {
    if (toneSelected) return
    setToneSelected(true)
    addUser(TONES.find((t) => t.id === tone).label)
    setStep('generating')
    await addCoach(COACH_MESSAGES[tone].toneConfirm, 800)
    await addCoach(COACH_MESSAGES[tone].generating, 600)

    let p = 0
    const interval = setInterval(() => {
      p = Math.min(100, p + Math.random() * 12 + 3)
      setProgress(p)
      if (p >= 100) clearInterval(interval)
    }, 180)

    setTimeout(async () => {
      clearInterval(interval)
      setProgress(100)
      const { name, age, gender, current, future, refined } = data.current
      const now = new Date().toISOString()
      const { answers, satisfaction, focus, extra, situation } = buildIntakeContext(current, future)

      // The three commitments, elevated to overarching goals. Their joined
      // titles are the "dream" the future-vision reads as their path forward.
      const commitments = (refined && refined.length ? refined : []).slice(0, 3)
      const goalForStory = commitments.map((r) => r.title).join('; ')
      const goalTitle = commitments[0]?.title || actionableTitle(goalForStory)

      // Personalized dream-life reading from Claude, built from the full intake
      // + their three commitments. Falls back to the local template if the API
      // is unavailable.
      let dreamStory
      try {
        dreamStory = await generateDreamLifeStory({ name, goal: goalForStory, goalTitle, extra, tone, focus, situation })
      } catch (e) {
        console.warn('[Onboarding] AI dream story failed, using local fallback:', e?.message)
      }
      if (!dreamStory) dreamStory = generateDreamStory({ name, age, answers, goalTitle, extra })

      // Build a roadmap for EACH commitment. Every goal is grounded in the full
      // intake; the raw action they named is passed as context so a one-and-done
      // becomes a stepping stone, never the goal. Nova's 3–12 month sizing wins
      // over the roadmap's own guess. If any AI call fails, that goal falls back
      // to a local scaffold the background upgrader specializes later — the
      // roadmap is never left empty.
      const goals = await Promise.all(
        commitments.map(async (r, i) => {
          const id = `goal-${i + 1}`
          const tf = Math.round(Number(r.timeframeMonths))
          const timeframeMonths = Number.isFinite(tf) ? Math.min(12, Math.max(3, tf)) : 6
          try {
            const ai = await generateRoadmap({
              name,
              rawGoal: r.title,
              extra,
              tone,
              situation,
              context: r.rootAction && r.rootAction !== r.title ? r.rootAction : '',
            })
            const built = normalizeAiGoal(ai, r.title, extra, id)
            // Keep Nova's elevated, overarching title (what the user agreed to) —
            // don't let the roadmap's own title guess pull it back to a task.
            return { ...built, title: r.title, timeframeMonths }
          } catch (e) {
            console.warn('[Onboarding] roadmap failed for commitment', i + 1, e?.message)
            return { ...buildGoal(r.title, extra, id), timeframeMonths }
          }
        }),
      )

      // NOTE: identity fields (userId/email/username) are NOT set here — App.js
      // merges this over the existing profile so the account linkage survives.
      const profile = {
        name,
        age,
        gender,
        coachTone: tone,
        coachName: 'Nova',
        dreamAnswers: answers,
        dreamSatisfaction: satisfaction,
        currentState: current,
        desiredFuture: future,
        commitments,
        additionalInfo: extra,
        dreamDescription: extra,
        primaryGoalRaw: commitments.map((r) => r.title).join(' · '),
        dreamStory,
        goals,
        nonNeg: {},
        sprints: [],
        streak: 0,
        lastCheckIn: null,
        joinedDate: now,
        lastLongTermReview: now,
      }
      onComplete(profile)
    }, 3400)
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 24,
            paddingTop: 56,
            paddingBottom: 18,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(167,139,250,0.1)',
          }}
        >
          {/* Back to the welcome screen — for anyone who tapped "Begin" but
              already has an account (the welcome screen has the Sign in link).
              Only on the first step, before any intake has been entered. */}
          {step === 'intake' && onBack && (
            <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to welcome">
              <ArrowLeft size={22} color={C.dim} strokeWidth={2.2} />
            </Pressable>
          )}
          <CoachAvatar size={42} />
          <View>
            <Text style={{ fontFamily: F.display, fontSize: 13.5, color: C.ink, letterSpacing: 1.4 }}>NOVA</Text>
            <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.green, marginTop: 2 }}>Online · Ready to begin</Text>
          </View>
        </View>

        {/* Messages + active form */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m) => (
            <MessageBubble key={m.id} from={m.from} text={m.text} />
          ))}
          {isTyping && <TypingDots />}

          {!isTyping && step === 'intake' && <IntakeForm onSubmit={submitIntake} askAccount={!hasAccount} />}
          {!isTyping && step === 'current' && (
            <IntakeSection
              kicker="WHERE I AM · HOW STRONG IS EACH TODAY?"
              questions={CURRENT_QUESTIONS}
              levels={CURRENT_LEVELS}
              noteHint="Add context (optional)"
              onSubmit={submitCurrent}
            />
          )}
          {!isTyping && step === 'future' && (
            <IntakeSection
              kicker="WHERE I'M GOING · HOW MUCH DOES EACH MATTER?"
              questions={FUTURE_QUESTIONS}
              levels={DESIRE_LEVELS}
              noteHint="Describe what you want (optional)"
              onSubmit={submitFuture}
            />
          )}

          {!isTyping && step === 'goal' && <ThreeCommitments onSubmit={submitCommitments} />}

          {step === 'tone' && !toneSelected && (
            <View style={{ gap: 12, marginTop: 4 }}>
              {TONES.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => handleTone(t.id)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 16,
                    borderRadius: 16,
                    paddingVertical: 14,
                    paddingHorizontal: 18,
                    backgroundColor: pressed ? 'rgba(167,139,250,0.15)' : C.violetFill07,
                    borderWidth: 1,
                    borderColor: pressed ? C.lineStrong : C.lineMid,
                  })}
                >
                  <Text style={{ fontSize: 22 }}>{t.emoji}</Text>
                  <View>
                    <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: C.ink }}>{t.label}</Text>
                    <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginTop: 1 }}>{t.desc}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {step === 'generating' && (
            <View style={{ alignItems: 'center', gap: 16, paddingVertical: 16 }}>
              <View style={{ width: '100%' }}>
                <GlowProgress value={progress} color={C.amber} height={4} />
              </View>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.faint }}>Generating your roadmap...</Text>
            </View>
          )}
        </ScrollView>

      </View>
    </KeyboardAvoidingView>
  )
}

// ── Three commitments → Nova elevates each into an overarching SMART goal ─────
// Three free-text lines (no preset goals). onSubmit returns an error string to
// re-ask (card stays editable) or null on success (the step advances).
const COMMIT_PLACEHOLDERS = [
  'A commitment that feels alive and true…',
  'One that feels necessary…',
  'One that would open the path…',
]
function ThreeCommitments({ onSubmit }) {
  const [goals, setGoals] = useState(['', '', ''])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const ready = goals.every((g) => g.trim().length >= 3) && !busy
  const setAt = (i, v) => setGoals((g) => g.map((x, j) => (j === i ? v : x)))

  const submit = async () => {
    setBusy(true)
    setError(null)
    const err = await onSubmit(goals.map((g) => g.trim()))
    if (err) {
      setError(err)
      setBusy(false)
    }
    // On success the step changes and this card unmounts.
  }

  return (
    <View style={cardStyle}>
      <Text style={cardKicker}>THREE COMMITMENTS · NEXT 3–12 MONTHS</Text>
      {[0, 1, 2].map((i) => (
        <Field key={i} label={`Commitment ${i + 1}`}>
          <TextInput
            value={goals[i]}
            onChangeText={(v) => setAt(i, v)}
            placeholder={COMMIT_PLACEHOLDERS[i]}
            placeholderTextColor={C.faint2}
            autoComplete="off"
            autoCorrect={false}
            importantForAutofill="no"
            multiline
            style={[fieldInput, { minHeight: 46, textAlignVertical: 'top', paddingTop: 12 }]}
          />
        </Field>
      ))}
      {error && (
        <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.amber, marginTop: 14, lineHeight: 18 }}>{error}</Text>
      )}
      <SubmitBar label={busy ? 'Building with Nova…' : 'Build these with Nova'} disabled={!ready} onPress={submit} />
    </View>
  )
}

// ── Intake form: name, age, gender (+ username & email for new accounts) ─────
const cleanUsername = (v) => (v || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || '').trim())

function IntakeForm({ onSubmit, askAccount }) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const accountReady = !askAccount || (username.trim().length >= 3 && looksLikeEmail(email) && password.length >= 8)
  const ready = name.trim() && age.trim() && gender && accountReady && !busy

  const submit = async () => {
    setBusy(true)
    setError(null)
    const err = await onSubmit({
      name: name.trim(),
      age: age.trim(),
      gender,
      username: cleanUsername(username),
      email: email.trim().toLowerCase(),
      password,
    })
    if (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <View style={cardStyle}>
      <Text style={cardKicker}>QUICK INTAKE</Text>
      <Field label="Your name">
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Sammy" placeholderTextColor={C.faint2} autoComplete="off" autoCorrect={false} importantForAutofill="no" style={fieldInput} />
      </Field>
      <Field label="Age">
        <TextInput value={age} onChangeText={setAge} placeholder="e.g. 27" placeholderTextColor={C.faint2} keyboardType="number-pad" autoComplete="off" importantForAutofill="no" style={fieldInput} />
      </Field>
      <Field label="Gender">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GENDERS.map((g) => (
            <Chip key={g} label={g} on={gender === g} onPress={() => setGender(g)} />
          ))}
        </View>
      </Field>
      {askAccount && (
        <>
          <Field label="Pick a username">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.faint }}>@</Text>
              <TextInput
                value={username}
                onChangeText={(v) => setUsername(cleanUsername(v))}
                placeholder="e.g. sammy_dreams"
                placeholderTextColor={C.faint2}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
                importantForAutofill="no"
                style={[fieldInput, { flex: 1 }]}
              />
            </View>
          </Field>
          <Field label="Email (we'll send a confirmation)">
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={C.faint2}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={fieldInput}
            />
          </Field>
          <Field label="Create a password (8+ characters)">
            <View style={[fieldInput, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 0 }]}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 8 characters"
                placeholderTextColor={C.faint2}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoComplete="new-password"
                style={{ flex: 1, fontFamily: F.body, fontSize: 14.5, color: C.ink, paddingVertical: 12 }}
              />
              <Pressable onPress={() => setShowPw(!showPw)} hitSlop={10}>
                {showPw ? <EyeOff size={16} color={C.faint2} strokeWidth={2} /> : <Eye size={16} color={C.faint2} strokeWidth={2} />}
              </Pressable>
            </View>
          </Field>
          <Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 16 }}>
            By continuing, you agree to our Terms &amp; Conditions and Privacy Policy (in Settings), and confirm you’re at least 13.
          </Text>
        </>
      )}
      {error && (
        <Text style={{ fontFamily: F.body, fontSize: 12.5, color: '#ef4444', marginTop: 12, lineHeight: 18 }}>{error}</Text>
      )}
      <SubmitBar label={busy ? 'Setting up…' : 'Continue'} disabled={!ready} onPress={submit} />
    </View>
  )
}

// ── Intake sections: 8 questions × (1–4 rating + optional note) ──────────────
// One component serves both "Where I Am" (CURRENT_LEVELS: how present each is
// today) and "Where I'm Going" (DESIRE_LEVELS: how much each matters). Notes
// are the free-text depth the future-vision draws on.
function IntakeSection({ kicker, questions, levels, noteHint, onSubmit }) {
  const [ratings, setRatings] = useState({})
  const [notes, setNotes] = useState({})
  const allRated = questions.every((q) => ratings[q.key] !== undefined)

  const submit = () => {
    const out = {}
    questions.forEach((q) => {
      out[q.key] = { rating: ratings[q.key], note: (notes[q.key] || '').trim() }
    })
    onSubmit(out)
  }

  return (
    <View style={cardStyle}>
      <Text style={cardKicker}>{kicker}</Text>
      <View style={{ gap: 16, marginTop: 4 }}>
        {questions.map((q, qi) => (
          <View key={q.key}>
            <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: C.ink2, marginBottom: 8 }}>{q.label}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {levels.map((lvl) => {
                const on = ratings[q.key] === lvl.v
                return (
                  <Pressable
                    key={lvl.v}
                    onPress={() => setRatings((r) => ({ ...r, [q.key]: lvl.v }))}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      paddingVertical: 8,
                      alignItems: 'center',
                      backgroundColor: on ? 'rgba(245,158,11,0.16)' : C.violetFill07,
                      borderWidth: 1,
                      borderColor: on ? C.amber : C.lineMid,
                    }}
                  >
                    <Text style={{ fontFamily: on ? F.bold : F.semibold, fontSize: 12.5, color: on ? C.amber : C.dim }}>{lvl.v}</Text>
                    <Text style={{ fontFamily: on ? F.semibold : F.body, fontSize: 9.5, color: on ? C.amber : C.faint, textAlign: 'center', marginTop: 1 }}>
                      {lvl.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <TextInput
              value={notes[q.key] || ''}
              onChangeText={(t) => setNotes((n) => ({ ...n, [q.key]: t }))}
              placeholder={noteHint}
              placeholderTextColor={C.faint2}
              autoComplete="off"
              style={[fieldInput, { marginTop: 8, paddingVertical: 9, fontSize: 13 }]}
            />
            {qi < questions.length - 1 && (
              <View style={{ height: 1, backgroundColor: 'rgba(167,139,250,0.1)', marginTop: 16 }} />
            )}
          </View>
        ))}
      </View>
      <SubmitBar label={allRated ? 'Continue' : 'Rate all 8 to continue'} disabled={!allRated} onPress={submit} />
    </View>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.dim, marginBottom: 7, letterSpacing: 0.3 }}>{label}</Text>
      {children}
    </View>
  )
}

function Chip({ label, on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: on ? 'rgba(245,158,11,0.16)' : C.violetFill07,
        borderWidth: 1,
        borderColor: on ? C.amber : C.lineMid,
      }}
    >
      <Text style={{ fontFamily: on ? F.semibold : F.body, fontSize: 12.5, color: on ? C.amber : C.dim }}>{label}</Text>
    </Pressable>
  )
}

function SubmitBar({ label, disabled, onPress, flush }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={{ marginTop: flush ? 0 : 18 }}>
      {disabled ? (
        <View style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.line }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.faint2 }}>{label}</Text>
        </View>
      ) : (
        <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.amberInk }}>{label}</Text>
        </LinearGradient>
      )}
    </Pressable>
  )
}

const cardStyle = {
  borderRadius: 18,
  padding: 18,
  backgroundColor: 'rgba(13,13,27,0.85)',
  borderWidth: 1,
  borderColor: C.lineMid,
}
const cardKicker = { fontFamily: F.display, fontSize: 10.5, color: C.violet, letterSpacing: 1.6 }
const fieldInput = {
  backgroundColor: C.lineSoft,
  borderWidth: 1,
  borderColor: C.lineStrong,
  borderRadius: 12,
  paddingVertical: 12,
  paddingHorizontal: 16,
  fontFamily: F.body,
  fontSize: 14.5,
  color: C.ink,
}
