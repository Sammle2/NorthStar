import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, Eye, EyeOff, RefreshCw } from 'lucide-react-native'
import { C, F } from '../tokens'
import CoachAvatar from '../components/CoachAvatar'
import GlowProgress from '../components/GlowProgress'
import { MessageBubble, TypingDots } from '../components/ChatBits'
import TermsAgreeRow from '../components/TermsAgreeRow'
import {
  COACH_MESSAGES,
  actionableTitle,
  buildGoal,
  capName,
  generateDreamStory,
  normalizeAiGoal,
  validateGoal,
} from '../aiEngine'
import { CATEGORIES, normalizeCategory } from '../mockData'
import { generateDreamLifeStory, generateGoalsForFocus, generateRoadmap } from '../../services/aiService'

const TONES = [
  { id: 'tough', label: 'Tough Love', desc: 'No BS, high expectations', emoji: '💪' },
  { id: 'default', label: 'Balanced', desc: 'Honest and encouraging', emoji: '⚡' },
  { id: 'gentle', label: 'Supportive', desc: 'Warm, patient, kind', emoji: '🌱' },
]
const GENDERS = ['Male', 'Female', 'Prefer not to say']

let idc = 0
const nid = () => `m${Date.now()}_${idc++}`

// Build the shared AI grounding from the 5-category intake — the per-category
// now→goal ratings and what the user is already carrying. Produces the situation
// text every generation prompt reads, a short dream anchor, the `extra` that
// doubles as dreamDescription, an `answers` map (category → 0–3 importance) for
// the local dream-story fallback, and a focus hint ('others'|'self'|'balanced').
const buildIntakeContext = (ratings = {}, focus = {}, pursuing = '') => {
  const rows = CATEGORIES.map((c) => {
    const r = ratings[c.key] || {}
    const now = Number.isFinite(+r.now) ? +r.now : 0
    const goal = Number.isFinite(+r.goal) ? +r.goal : 0
    return { key: c.key, label: c.label, blurb: c.blurb, now, goal, gap: Math.max(0, goal - now) }
  })
  // Importance for the local story: how high they want to reach in each area.
  const answers = {}
  rows.forEach((r) => { answers[r.key] = Math.max(0, Math.min(3, Math.round((r.goal / 10) * 3))) })

  const top = [...rows].sort((a, b) => b.gap - a.gap).filter((r) => r.gap > 0).slice(0, 3)
  const topKeys = top.map((r) => r.key)
  const focusHint = topKeys.includes('relationships') && !topKeys.includes('work')
    ? 'others'
    : (topKeys.includes('work') || topKeys.includes('mind')) && !topKeys.includes('relationships')
      ? 'self'
      : 'balanced'

  const pursuit = (pursuing || '').trim()
  const situation = [
    'Where they are now → where they want to be (0 = struggling, 10 = thriving):',
    ...rows.map((r) => `- ${r.label} (${r.blurb}): ${r.now} → ${r.goal}`),
    ...(pursuit ? ["What they're already carrying right now:", pursuit] : []),
  ].join('\n').slice(0, 2000)

  const grow = top.map((r) => r.label.toLowerCase()).join(', ')
  const extra = [grow ? `Most wants to grow: ${grow}.` : '', pursuit ? `Already carrying: ${pursuit}.` : '']
    .filter(Boolean).join(' ').slice(0, 1200)
  const dream = grow ? `growing ${grow}` : 'a life of steady progress across every area'

  return { answers, focus: focusHint, extra, situation, dream }
}

// Local starter goals per category — used only when the AI proposal is
// unavailable (offline), so the flow always has editable, SMART-shaped titles.
// Each is an OUTCOME/identity to reach — never a recurring task or quota (those
// belong to the goal's tasks and checkpoints, not the goal title itself).
const STARTER_TITLES = {
  mind: ['Become a Sharp, Focused Thinker', 'Grow Into a Lifelong Learner', 'Master a Skill That Matters to Me'],
  body: ['Build a Strong, Energized Body', 'Become Fit and Full of Energy', 'Feel Healthy and Rested Every Day'],
  spirit: ['Cultivate Lasting Inner Peace', 'Live with Calm and Clarity', 'Feel Grounded in My Purpose'],
  work: ['Build a Career I’m Proud Of', 'Reach Real Financial Freedom', 'Become Known for Work That Matters'],
  relationships: ['Build Deep, Lasting Relationships', 'Become the Friend People Rely On', 'Grow Closer to the People I Love'],
}
const localGoalTitle = (cat, i) => (STARTER_TITLES[cat] || STARTER_TITLES.mind)[i % 3]

// Turn the AI's loose [{category,title}] into exactly focus[cat] goals per
// category (in framework order), padding any shortfall with local starters.
const shapeProposed = (aiGoals, focus) => {
  const byCat = {}
  ;(aiGoals || []).forEach((g) => {
    const cat = normalizeCategory(g.category)
    if (!focus[cat]) return
    const t = String(g.title || '').trim()
    if (t) (byCat[cat] = byCat[cat] || []).push(t)
  })
  const out = []
  CATEGORIES.forEach((c) => {
    const want = focus[c.key] || 0
    const got = byCat[c.key] || []
    for (let i = 0; i < want; i++) out.push({ category: c.key, title: got[i] || localGoalTitle(c.key, i) })
  })
  return out
}

// Screen 2 — the Coach's first conversation: intake form (incl. picking a
// username + email for new accounts) → "Where I Am" (8 × 1–4 + optional note)
// → "Where I'm Going" (8 × 1–4 + optional note) → what they're already
// pursuing → three commitments Nova elevates into overarching SMART goals →
// an editable review (Nova re-checks each edit stays SMART) → tone → generate.
export default function Onboarding({ onComplete, onClaimAccount, hasAccount, onBack }) {
  const [messages, setMessages] = useState([])
  const [step, setStep] = useState('intake') // intake | ratings | priorities | pursuing | propose | tone | generating
  const [isTyping, setIsTyping] = useState(false)
  const [toneSelected, setToneSelected] = useState(false)
  const [progress, setProgress] = useState(0)
  const data = useRef({ name: '', age: '', gender: '', username: '', email: '', ratings: {}, focus: {}, pursuing: '', proposed: [] })
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
  // No auto-scroll: the view stays put when Nova replies, so a new message never
  // yanks the user away from the form or the line they were reading.

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
    setStep('ratings')
    await addCoach("Let's map your life across five areas — Mind, Body, Spirit, Work, and Relationships. For each, mark where you are now and where you want to be.", 1000)
    return null
  }

  // Where they are now vs. where they want to be, across the five categories.
  const submitRatings = async (ratings) => {
    data.current = { ...data.current, ratings }
    addUser('Mapped all five areas')
    setStep('priorities')
    await addCoach('Which of these matter most right now — and how many goals do you want in each? Keep it focused: up to 5 goals total, and no more than 3 in any one area.', 1000)
  }

  // How many goals per category (≤5 total, ≤3 each). The stepper enforces caps.
  const submitPriorities = async (focus) => {
    data.current = { ...data.current, focus }
    const total = Object.values(focus).reduce((s, n) => s + n, 0)
    addUser(`Focusing on ${total} goal${total === 1 ? '' : 's'}`)
    setStep('pursuing')
    await addCoach("One more thing before I draft them — what are you already carrying right now? School, a job, a relationship, a project. It helps me fit these goals to your real life.", 1100)
  }

  // What they're already carrying, then NOVA proposes the goals from the intake.
  const submitPursuing = async (pursuing) => {
    data.current = { ...data.current, pursuing }
    addUser(pursuing && pursuing.trim() ? pursuing.trim() : 'Nothing structured right now')
    setIsTyping(true)
    const { ratings, focus, name } = data.current
    let proposed
    try {
      const ai = await generateGoalsForFocus({ focus, ratings, pursuing, name, tone: 'default' })
      proposed = shapeProposed(ai, focus)
    } catch (e) {
      console.warn('[Onboarding] focus-goal generation failed, using local starters:', e?.message)
      proposed = shapeProposed([], focus)
    }
    data.current = { ...data.current, proposed }
    setIsTyping(false)
    // Prompt-before-setStep: the propose card is not gated on isTyping, so we
    // reveal it only once Nova has finished speaking.
    await addCoach("Here's where I'd focus your energy. Agree with each one, tweak the wording, or regenerate any that don't fit — then we'll build the roadmaps.", 1100)
    setStep('propose')
  }

  // Regenerate a single proposed goal in place (its category, one fresh title).
  // Returns a new title string, or null to keep the current one (AI unavailable).
  const regenerateProposed = async (index) => {
    const p = data.current.proposed[index]
    if (!p) return null
    try {
      const ai = await generateGoalsForFocus({ focus: { [p.category]: 1 }, ratings: data.current.ratings, pursuing: data.current.pursuing, name: data.current.name, tone: 'default' })
      const hit = ai.find((g) => normalizeCategory(g.category) === p.category) || ai[0]
      const t = hit && String(hit.title || '').trim()
      if (t) {
        data.current = { ...data.current, proposed: data.current.proposed.map((x, i) => (i === index ? { ...x, title: t } : x)) }
        return t
      }
    } catch (e) { /* keep current */ }
    return null
  }

  // The user agrees to (and optionally edits) the proposed goals. A fast local
  // guardrail rejects empty/gibberish edits; on success we advance to tone.
  // Returns an error STRING (card stays editable) or null (advance).
  const submitPropose = async (finalTitles) => {
    for (let i = 0; i < finalTitles.length; i++) {
      const check = validateGoal(finalTitles[i])
      if (!check.ok) return `Goal ${i + 1}: ${check.clarify}`
    }
    const proposed = data.current.proposed.map((p, i) => ({ ...p, title: finalTitles[i].trim() }))
    data.current = { ...data.current, proposed }
    addUser(proposed.map((p, i) => `${i + 1}. ${p.title}`).join('\n'))
    setStep('tone')
    await addCoach('Locked in. Last thing: how do you want me to coach you?', 900)
    return null
  }

  const handleTone = async (tone) => {
    if (toneSelected) return
    setToneSelected(true)
    addUser(TONES.find((t) => t.id === tone).label)
    setStep('generating')
    await addCoach(COACH_MESSAGES[tone].toneConfirm, 800)
    await addCoach(COACH_MESSAGES[tone].generating, 600)

    const { name, age, gender, ratings, focus: categoryFocus, pursuing, proposed } = data.current
    const now = new Date().toISOString()
    const { answers, focus, extra, situation } = buildIntakeContext(ratings, categoryFocus, pursuing)

    // The proposed goals the user agreed to (one per category-slot they chose).
    // Their joined titles are the "dream" the future-vision reads as their path.
    const commitments = (proposed || []).slice(0, 5)
    const goalForStory = commitments.map((r) => r.title).join('; ')
    const goalTitle = commitments[0]?.title || actionableTitle(goalForStory)

    // The progress bar tracks REAL work: it eases toward a target that only
    // advances as each AI call actually finishes (the dream story, then one
    // roadmap per goal), and it reaches 100% only the moment the reveal is ready
    // — never before. Between milestones it keeps easing so it always feels alive.
    const stepCount = commitments.length + 1 // story + one roadmap per goal
    let doneSteps = 0
    let target = 12
    const bumpTarget = () => {
      doneSteps += 1
      target = 12 + Math.round((doneSteps / stepCount) * 82) // 12 → ~94
    }
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + (target - p) * 0.08
        return next > target - 0.5 ? target : next
      })
    }, 160)

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
    bumpTarget() // story done

    // Build a roadmap for EACH commitment. Every goal is grounded in the full
    // intake; the raw action they named is passed as context so a one-and-done
    // becomes a stepping stone, never the goal. Nova's 3–12 month sizing wins
    // over the roadmap's own guess. If any AI call fails, that goal falls back
    // to a local scaffold the background upgrader specializes later — the
    // roadmap is never left empty.
    const goals = await Promise.all(
      commitments.map(async (r, i) => {
        const id = `goal-${i + 1}`
        try {
          const ai = await generateRoadmap({ name, rawGoal: r.title, extra, tone, situation })
          const built = normalizeAiGoal(ai, r.title, extra, id)
          // Keep the title the user agreed to and FORCE the category they chose —
          // the goal belongs to the category-slot it was proposed in.
          return { ...built, title: r.title, category: r.category }
        } catch (e) {
          console.warn('[Onboarding] roadmap failed for goal', i + 1, e?.message)
          return buildGoal(r.title, extra, id, r.category)
        } finally {
          bumpTarget() // this goal's roadmap done
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
      categoryRatings: ratings,
      categoryFocus,
      currentPursuits: pursuing,
      additionalInfo: extra,
      dreamDescription: extra || 'Building a life across Mind, Body, Spirit, Work, and Relationships.',
      primaryGoalRaw: commitments.map((r) => r.title).join(' · '),
      dreamStory,
      goals,
      frameworkVersion: 2,
      nonNeg: {},
      sprints: [],
      streak: 0,
      lastCheckIn: null,
      joinedDate: now,
      lastLongTermReview: now,
    }

    // Everything is ready — fill the bar to 100% and let it visibly land (the
    // bar eases over ~1.2s) before the reveal takes over.
    clearInterval(interval)
    setProgress(100)
    setTimeout(() => onComplete(profile), 1000)
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
          {!isTyping && step === 'ratings' && <CategoryRatings onSubmit={submitRatings} />}
          {!isTyping && step === 'priorities' && <CategoryPriorities onSubmit={submitPriorities} />}
          {!isTyping && step === 'pursuing' && <CurrentCommitments onSubmit={submitPursuing} />}

          {/* The propose card is NOT gated on isTyping: it drives its own AI calls
              (regenerate) and can re-display after a rejected edit, so a typing
              indicator must not unmount it and wipe the user's edits. It only
              appears once Nova's prompt has finished (prompt-before-setStep). */}
          {step === 'propose' && (
            <ProposedGoals initial={data.current.proposed || []} onSubmit={submitPropose} onRegenerate={regenerateProposed} />
          )}

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

// ── What they're already pursuing — context before setting new commitments ───
// One free-text box (school, work targets, relationships, projects). Optional,
// but the answer grounds every goal Nova builds in their real, already-full life.
function CurrentCommitments({ onSubmit }) {
  const [text, setText] = useState('')
  return (
    <View style={cardStyle}>
      <Text style={cardKicker}>WHAT YOU'RE CARRYING NOW</Text>
      <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginTop: 8, lineHeight: 18 }}>
        School, a target at work, a relationship, a project — whatever you're already committed to. It helps me build goals that fit your real life.
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="e.g. Finishing my degree, hitting quota at work, training for a race…"
        placeholderTextColor={C.faint2}
        autoComplete="off"
        multiline
        style={[fieldInput, { minHeight: 96, textAlignVertical: 'top', paddingTop: 12, marginTop: 14 }]}
      />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Pressable onPress={() => onSubmit('')} style={{ flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }}>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.dim }}>Nothing right now</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <SubmitBar label="Continue" disabled={!text.trim()} onPress={() => onSubmit(text)} flush />
        </View>
      </View>
    </View>
  )
}

// ── NOVA's proposed goals — agree, tweak, or regenerate ──────────────────────
// One card grouped by category. The user edits any title inline, regenerates any
// single goal (onRegenerate → a fresh AI title for that category), then builds.
// onSubmit returns an error STRING (card stays editable) or null (step advances).
function ProposedGoals({ initial, onSubmit, onRegenerate }) {
  const [titles, setTitles] = useState(() => initial.map((p) => p.title))
  const [busyIdx, setBusyIdx] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const ready = titles.length > 0 && titles.every((t) => t.trim().length >= 3) && !busy
  const setAt = (i, v) => setTitles((t) => t.map((x, j) => (j === i ? v : x)))

  const regen = async (i) => {
    setBusyIdx(i)
    const t = await onRegenerate(i)
    if (t) setAt(i, t)
    setBusyIdx(-1)
  }
  const submit = async () => {
    setBusy(true)
    setError(null)
    const err = await onSubmit(titles.map((t) => t.trim()))
    if (err) { setError(err); setBusy(false) }
    // On success the step changes and this card unmounts.
  }

  return (
    <View style={cardStyle}>
      <Text style={cardKicker}>YOUR GOALS · AGREE OR TWEAK</Text>
      {initial.map((p, i) => {
        const c = CATEGORIES.find((x) => x.key === p.category) || CATEGORIES[0]
        return (
          <View key={i} style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.color }} />
              <Text style={{ fontFamily: F.bold, fontSize: 10, color: c.color, letterSpacing: 1 }}>{c.label.toUpperCase()}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <TextInput
                value={titles[i]}
                onChangeText={(v) => setAt(i, v)}
                placeholder="Your goal"
                placeholderTextColor={C.faint2}
                autoComplete="off"
                autoCorrect={false}
                importantForAutofill="no"
                multiline
                style={[fieldInput, { flex: 1, minHeight: 46, textAlignVertical: 'top', paddingTop: 12 }]}
              />
              <Pressable onPress={() => regen(i)} disabled={busyIdx >= 0} hitSlop={6} style={{ width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong, opacity: busyIdx >= 0 && busyIdx !== i ? 0.4 : 1 }}>
                {busyIdx === i ? <ActivityIndicator size={14} color={C.violet} /> : <RefreshCw size={15} color={C.violet} strokeWidth={2.2} />}
              </Pressable>
            </View>
          </View>
        )
      })}
      {error && (
        <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.amber, marginTop: 14, lineHeight: 18 }}>{error}</Text>
      )}
      <SubmitBar label={busy ? 'Building your roadmaps…' : 'Build these goals'} disabled={!ready} onPress={submit} />
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
  const [agreed, setAgreed] = useState(false)
  const accountReady = !askAccount || (username.trim().length >= 3 && looksLikeEmail(email) && password.length >= 8 && agreed)
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
          <TermsAgreeRow agreed={agreed} onToggle={() => setAgreed(!agreed)} style={{ marginTop: 14 }} />
        </>
      )}
      {error && (
        <Text style={{ fontFamily: F.body, fontSize: 12.5, color: '#ef4444', marginTop: 12, lineHeight: 18 }}>{error}</Text>
      )}
      <SubmitBar label={busy ? 'Setting up…' : 'Continue'} disabled={!ready} onPress={submit} />
    </View>
  )
}

// ── A 0–10 slider (tap or drag the track) ────────────────────────────────────
function RatingSlider({ value, onChange, color = C.amber }) {
  const [w, setW] = useState(0)
  const set = (x) => {
    if (!w) return
    onChange(Math.round(Math.max(0, Math.min(1, x / w)) * 10))
  }
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => set(e.nativeEvent.locationX)}
      onResponderMove={(e) => set(e.nativeEvent.locationX)}
      style={{ height: 28, justifyContent: 'center' }}
    >
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.lineStrong }}>
        <View style={{ height: 6, borderRadius: 3, width: `${value * 10}%`, backgroundColor: color }} />
      </View>
      <View style={{ position: 'absolute', left: `${value * 10}%`, marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: color, borderWidth: 2, borderColor: C.bg }} />
    </View>
  )
}

const sliderLbl = { fontFamily: F.medium, fontSize: 11, color: C.faint }

// ── Where you are now vs. where you want to be, across the five categories ────
function CategoryRatings({ onSubmit }) {
  const [vals, setVals] = useState(() => {
    const o = {}
    CATEGORIES.forEach((c) => { o[c.key] = { now: 5, goal: 7 } })
    return o
  })
  // Keep goal ≥ now so the gap (what drives priority) is never negative.
  const setV = (key, which, v) =>
    setVals((s) => ({
      ...s,
      [key]: which === 'now' ? { ...s[key], now: Math.min(v, s[key].goal) } : { ...s[key], goal: Math.max(v, s[key].now) },
    }))

  return (
    <View style={cardStyle}>
      <Text style={cardKicker}>WHERE YOU ARE · WHERE YOU'RE GOING</Text>
      <View style={{ gap: 4, marginTop: 12 }}>
        {CATEGORIES.map((c, i) => (
          <View key={c.key}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
              <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.ink }}>{c.label}</Text>
              <Text style={{ fontFamily: F.body, fontSize: 10.5, color: C.faint, flex: 1 }} numberOfLines={1}>· {c.blurb}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={sliderLbl}>Now</Text><Text style={[sliderLbl, { color: C.dim, fontFamily: F.bold }]}>{vals[c.key].now}</Text>
            </View>
            <RatingSlider value={vals[c.key].now} onChange={(v) => setV(c.key, 'now', v)} color={C.dim} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={sliderLbl}>Goal</Text><Text style={[sliderLbl, { color: c.color, fontFamily: F.bold }]}>{vals[c.key].goal}</Text>
            </View>
            <RatingSlider value={vals[c.key].goal} onChange={(v) => setV(c.key, 'goal', v)} color={c.color} />
            {i < CATEGORIES.length - 1 && <View style={{ height: 1, backgroundColor: 'rgba(167,139,250,0.1)', marginTop: 14, marginBottom: 2 }} />}
          </View>
        ))}
      </View>
      <SubmitBar label="Continue" onPress={() => onSubmit(vals)} />
    </View>
  )
}

// ── Which categories matter now + how many goals each (≤5 total, ≤3 each) ─────
const stepBtn = (off) => ({ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid, opacity: off ? 0.35 : 1 })
const stepTxt = { fontFamily: F.bold, fontSize: 18, color: C.ink2, lineHeight: 20 }
function CategoryPriorities({ onSubmit }) {
  const [counts, setCounts] = useState(() => {
    const o = {}
    CATEGORIES.forEach((c) => { o[c.key] = 0 })
    return o
  })
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  const inc = (key) => { if (total >= 5 || counts[key] >= 3) return; setCounts((s) => ({ ...s, [key]: s[key] + 1 })) }
  const dec = (key) => setCounts((s) => ({ ...s, [key]: Math.max(0, s[key] - 1) }))

  return (
    <View style={cardStyle}>
      <Text style={cardKicker}>WHICH MATTER NOW · HOW MANY GOALS</Text>
      <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 8, lineHeight: 18 }}>
        Up to 5 goals total, at most 3 in any one area. Leave the ones that aren't a priority right now at zero.
      </Text>
      <View style={{ gap: 10, marginTop: 14 }}>
        {CATEGORIES.map((c) => {
          const on = counts[c.key] > 0
          return (
            <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: on ? c.color + '14' : 'transparent', borderWidth: 1, borderColor: on ? c.color + '55' : C.lineMid }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: C.ink }}>{c.label}</Text>
                <Text style={{ fontFamily: F.body, fontSize: 10.5, color: C.faint }} numberOfLines={1}>{c.blurb}</Text>
              </View>
              <Pressable onPress={() => dec(c.key)} disabled={counts[c.key] === 0} hitSlop={6} style={stepBtn(counts[c.key] === 0)}><Text style={stepTxt}>−</Text></Pressable>
              <Text style={{ width: 20, textAlign: 'center', fontFamily: F.bold, fontSize: 15, color: on ? c.color : C.faint }}>{counts[c.key]}</Text>
              <Pressable onPress={() => inc(c.key)} disabled={total >= 5 || counts[c.key] >= 3} hitSlop={6} style={stepBtn(total >= 5 || counts[c.key] >= 3)}><Text style={stepTxt}>+</Text></Pressable>
            </View>
          )
        })}
      </View>
      <Text style={{ fontFamily: F.medium, fontSize: 11.5, color: total > 0 ? C.amber : C.faint, marginTop: 12, textAlign: 'center' }}>{total} of 5 goals selected</Text>
      <SubmitBar label={total === 0 ? 'Pick at least one' : 'Continue'} disabled={total === 0} onPress={() => onSubmit(counts)} />
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
