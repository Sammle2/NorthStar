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
import { Send } from 'lucide-react-native'
import { C, F } from '../tokens'
import CoachAvatar from '../components/CoachAvatar'
import GlowProgress from '../components/GlowProgress'
import { MessageBubble, TypingDots } from '../components/ChatBits'
import {
  COACH_MESSAGES,
  DREAM_QUESTIONS,
  INTEREST_LEVELS,
  MAX_EVERYTHING,
  actionableTitle,
  capName,
  generateDreamStory,
  generateGoals,
  validateGoal,
} from '../aiEngine'
import { generateDreamLifeStory } from '../../services/aiService'

const TONES = [
  { id: 'tough', label: 'Tough Love', desc: 'No BS, high expectations', emoji: '💪' },
  { id: 'default', label: 'Balanced', desc: 'Honest and encouraging', emoji: '⚡' },
  { id: 'gentle', label: 'Supportive', desc: 'Warm, patient, kind', emoji: '🌱' },
]
const GENDERS = ['Male', 'Female', 'Prefer not to say']

let idc = 0
const nid = () => `m${Date.now()}_${idc++}`

// Screen 2 — the Coach's first conversation: intake form → 8-question dream
// survey → free-text add-ons → primary goal (validated) → tone → generate.
export default function Onboarding({ onComplete }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [step, setStep] = useState('intake') // intake | survey | extra | goal | tone | generating
  const [isTyping, setIsTyping] = useState(false)
  const [toneSelected, setToneSelected] = useState(false)
  const [progress, setProgress] = useState(0)
  const data = useRef({ name: '', age: '', gender: '', answers: {}, extra: '', goal: '' })
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
    addCoach(COACH_MESSAGES.default.welcome.replace('{coach}', 'Coach'), 800)
  }, [])
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
  }, [messages, isTyping, step])

  const submitIntake = async ({ name, age, gender }) => {
    const capped = capName(name)
    data.current = { ...data.current, name: capped, age, gender }
    addUser(`${capped} · ${age} · ${gender}`)
    setStep('survey')
    await addCoach(COACH_MESSAGES.default.dreamIntro, 1000)
  }

  const submitSurvey = async (answers) => {
    data.current = { ...data.current, answers }
    addUser('Rated my dream life ✦')
    setStep('extra')
    await addCoach(COACH_MESSAGES.default.extraPrompt, 900)
  }

  const submitExtra = async (extra) => {
    data.current = { ...data.current, extra }
    addUser(extra && extra.trim() ? extra.trim() : 'Nothing to add — let’s keep going.')
    setStep('goal')
    await addCoach(COACH_MESSAGES.default.goalPrompt, 1000)
  }

  const submitGoal = async () => {
    const value = input.trim()
    if (!value) return
    setInput('')
    addUser(value)
    const check = validateGoal(value)
    if (!check.ok) {
      await addCoach(check.clarify, 900)
      return // stay on goal step for a better answer
    }
    data.current = { ...data.current, goal: value }
    setStep('tone')
    await addCoach('Got it — and that one we can build. Last thing: how do you want me to coach you?', 900)
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
      const { name, age, gender, answers, extra, goal } = data.current
      const now = new Date().toISOString()
      const goalTitle = actionableTitle(goal)

      // Personalized dream-life reading from Claude, built from THIS user's own
      // dream/goal. Falls back to the local template if the API is unavailable.
      let dreamStory
      try {
        dreamStory = await generateDreamLifeStory({ name, goal, goalTitle, extra, tone })
      } catch (e) {
        console.warn('[Onboarding] AI dream story failed, using local fallback:', e?.message)
      }
      if (!dreamStory) dreamStory = generateDreamStory({ name, age, answers, goalTitle, extra })

      const profile = {
        name,
        age,
        gender,
        coachTone: tone,
        coachName: 'Coach',
        dreamAnswers: answers,
        additionalInfo: extra,
        dreamDescription: extra,
        primaryGoalRaw: goal,
        dreamStory,
        goals: generateGoals(goal, answers, extra),
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
          <CoachAvatar size={42} />
          <View>
            <Text style={{ fontFamily: F.display, fontSize: 13.5, color: C.ink, letterSpacing: 1.4 }}>COACH</Text>
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

          {!isTyping && step === 'intake' && <IntakeForm onSubmit={submitIntake} />}
          {!isTyping && step === 'survey' && <DreamSurvey onSubmit={submitSurvey} />}
          {!isTyping && step === 'extra' && <ExtraInfo onSubmit={submitExtra} />}

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

        {/* Bottom input — only for the goal step */}
        {step === 'goal' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={submitGoal}
              placeholder="Your most important goal..."
              placeholderTextColor={C.faint2}
              autoFocus
              autoComplete="off"
              autoCorrect={false}
              importantForAutofill="no"
              returnKeyType="send"
              style={inputStyle}
            />
            <SendButton active={!!input.trim()} onPress={submitGoal} />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

// ── Intake form: name, age, gender ──────────────────────────────────────────
function IntakeForm({ onSubmit }) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const ready = name.trim() && age.trim() && gender
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
      <SubmitBar label="Continue" disabled={!ready} onPress={() => onSubmit({ name: name.trim(), age: age.trim(), gender })} />
    </View>
  )
}

// ── Dream survey: 8 domains × interest level ────────────────────────────────
function DreamSurvey({ onSubmit }) {
  const [answers, setAnswers] = useState({})
  const [warn, setWarn] = useState(false)
  const allAnswered = DREAM_QUESTIONS.every((q) => answers[q.key] !== undefined)

  const pick = (key, v) => {
    if (v === 3) {
      const others = Object.entries(answers).filter(([k, val]) => val === 3 && k !== key).length
      if (others >= MAX_EVERYTHING) {
        setWarn(true)
        return
      }
    }
    setWarn(false)
    setAnswers((a) => ({ ...a, [key]: v }))
  }

  return (
    <View style={cardStyle}>
      <Text style={cardKicker}>YOUR DREAM LIFE · HOW MUCH DOES EACH PULL AT YOU?</Text>
      <View style={{ gap: 18, marginTop: 4 }}>
        {DREAM_QUESTIONS.map((q) => (
          <View key={q.key}>
            <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: C.ink2, marginBottom: 8 }}>
              {q.label}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {INTEREST_LEVELS.map((lvl) => {
                const on = answers[q.key] === lvl.v
                return (
                  <Pressable
                    key={lvl.v}
                    onPress={() => pick(q.key, lvl.v)}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      paddingVertical: 9,
                      alignItems: 'center',
                      backgroundColor: on ? 'rgba(245,158,11,0.16)' : C.violetFill07,
                      borderWidth: 1,
                      borderColor: on ? C.amber : C.lineMid,
                    }}
                  >
                    <Text style={{ fontFamily: on ? F.semibold : F.body, fontSize: 10.5, color: on ? C.amber : C.dim, textAlign: 'center' }}>
                      {lvl.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ))}
      </View>
      {warn && (
        <Text style={{ fontFamily: F.medium, fontSize: 12.5, color: C.amber, marginTop: 14, textAlign: 'center' }}>
          You can only choose 2, which are the most important to you?
        </Text>
      )}
      <SubmitBar label={allAnswered ? 'Continue' : 'Rate all 8 to continue'} disabled={!allAnswered} onPress={() => onSubmit(answers)} />
    </View>
  )
}

// ── Optional free-text add-ons ──────────────────────────────────────────────
function ExtraInfo({ onSubmit }) {
  const [text, setText] = useState('')
  return (
    <View style={cardStyle}>
      <Text style={cardKicker}>ANYTHING ELSE? (OPTIONAL)</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Add anything about the life you want — details, people, places, feelings..."
        placeholderTextColor={C.faint2}
        multiline
        style={[fieldInput, { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }]}
      />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Pressable onPress={() => onSubmit('')} style={{ flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }}>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.dim }}>Skip</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <SubmitBar label="Continue" disabled={false} onPress={() => onSubmit(text)} flush />
        </View>
      </View>
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

function SendButton({ active, onPress }) {
  return (
    <Pressable onPress={active ? onPress : undefined}>
      {active ? (
        <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sendStyle}>
          <Send size={18} color={C.amberInk} strokeWidth={2.2} />
        </LinearGradient>
      ) : (
        <View style={[sendStyle, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
          <Send size={18} color={C.faint2} strokeWidth={2.2} />
        </View>
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
const inputStyle = {
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
}
const sendStyle = { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }
