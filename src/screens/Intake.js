import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Btn, Card, H1, Kicker } from '../components/Ui'
import JarvisOrb from '../components/JarvisOrb'
import { intake as apiIntake } from '../jarvis'
import { uid } from '../storage'
import { catColor } from '../theme'

// Flow: welcome → questionnaire → generating → narrative (word-by-word) → the path → begin.
const WELCOME = -1
const QUESTIONS = 0
const GENERATING = 1
const NARRATIVE = 2
const PATH = 3

// Specific questions that paint the picture — chips, not essays.
const QUESTIONNAIRE = [
  { id: 'wake', q: 'When does your dream self wake up?', options: ['Before sunrise', 'Early morning', 'Mid-morning'] },
  { id: 'first', q: 'The first hour of the day is…', options: ['Movement & sweat', 'Stillness & prayer', 'Coffee & pages'] },
  { id: 'home', q: 'Where do you live?', options: ['By the ocean', 'In the mountains', 'City energy', 'Quiet countryside'] },
  { id: 'work', q: 'Your work in the dream life?', options: ['Building my business', 'Creating — writing, art', 'Leading & mentoring', 'Investing & advising'] },
  { id: 'hours', q: 'How much of the day is real work?', options: ['4 deep hours', '6 steady hours', 'Sunrise-to-dinner builder'] },
  { id: 'money', q: 'How does money feel?', options: ['Never check the price', 'Comfortable & free', 'Wealthy enough to give big'] },
  { id: 'body', q: 'Your body in five years?', options: ['Lean & fast', 'Strong & powerful', 'Athletic & limber'] },
  { id: 'evening', q: 'Evenings look like…', options: ['Dinner with my person', 'Friends & laughter', 'Quiet reading', 'Out under the sky'] },
  { id: 'people', q: 'Who is beside you?', options: ['Spouse & kids', 'My partner', 'A close circle', 'Building solo for now'] },
  { id: 'travel', q: 'Your travel rhythm?', options: ['A trip every quarter', 'One epic trip a year', 'Months abroad', 'Home is the adventure'] },
  { id: 'spirit', q: 'Faith & spirit?', options: ['Daily prayer & church', 'Meditation & gratitude', 'Nature is my chapel'] },
  { id: 'legacy', q: 'What do people thank you for?', options: ['My ideas & book', 'My generosity', 'My coaching', 'My example'] },
]

export default function Intake({ colors, onComplete }) {
  const [step, setStep] = useState(WELCOME)
  const [answers, setAnswers] = useState({})
  const [extra, setExtra] = useState('')
  const [result, setResult] = useState(null)

  const allAnswered = QUESTIONNAIRE.every((q) => answers[q.id])

  async function generate() {
    setStep(GENERATING)
    const qa = QUESTIONNAIRE.map((q) => ({ question: q.q, answer: answers[q.id] }))
    const data = await apiIntake(qa, extra)
    const tree = data?.dreams?.length ? data : localTree(answers, extra)
    setResult({
      narrative: tree.narrative,
      dreams: tree.dreams.map((d) => ({
        id: uid(),
        title: d.title,
        category: d.category || 'Lifestyle',
        goals: (d.goals || []).map((g) => ({
          id: uid(),
          title: g.title,
          accepted: true,
          steps: (g.steps || []).map((s) => ({ id: uid(), title: s.title, routine: !!s.routine })),
        })),
      })),
    })
    setStep(NARRATIVE)
  }

  function toggleGoal(dreamId, goalId) {
    setResult((r) => ({
      ...r,
      dreams: r.dreams.map((d) =>
        d.id !== dreamId
          ? d
          : { ...d, goals: d.goals.map((g) => (g.id === goalId ? { ...g, accepted: !g.accepted } : g)) },
      ),
    }))
  }

  // ---------- welcome ----------
  if (step === WELCOME)
    return (
      <View style={styles.center}>
        <JarvisOrb size={150} />
        <Text style={[styles.welcomeTitle, { color: colors.ink }]}>
          You're here because you want to elevate your life.
        </Text>
        <Text style={[styles.welcomeSub, { color: colors.inkDim }]}>
          I'm here to help you discover where you're going — and how to get you there.
        </Text>
        <Btn colors={colors} label="Let's get started" onPress={() => setStep(QUESTIONS)} style={{ marginTop: 30, minWidth: 220 }} />
      </View>
    )

  // ---------- the questionnaire: specific, fast, picture-painting ----------
  if (step === QUESTIONS)
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pad}>
        <Kicker colors={colors}>Paint me the picture</Kicker>
        <H1 colors={colors}>Your dream life, exactly.</H1>
        <Text style={{ color: colors.inkDim, fontSize: 13.5, marginTop: 8, lineHeight: 20 }}>
          Tap what's true in the life you're building. The more honest, the more it'll hit when I
          read it back to you.
        </Text>
        {QUESTIONNAIRE.map((q) => (
          <View key={q.id} style={[styles.qRow, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14.5, flex: 1, paddingRight: 12 }}>
              {q.q}
            </Text>
            <View style={styles.chipCol}>
              {q.options.map((opt) => {
                const on = answers[q.id] === opt
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                    style={[
                      styles.chip,
                      { borderColor: on ? colors.primary : colors.lineStrong, backgroundColor: on ? colors.primarySoft : 'transparent' },
                    ]}
                  >
                    <Text style={{ color: on ? colors.primary : colors.inkDim, fontSize: 12, fontWeight: on ? '800' : '500' }}>
                      {opt}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ))}
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14.5, marginTop: 22 }}>
          What else is in your dream life?
        </Text>
        <TextInput
          value={extra}
          onChangeText={setExtra}
          placeholder="The book on the shelf with my name on it. Christina laughing in the passenger seat…"
          placeholderTextColor={colors.inkFaint}
          multiline
          style={[styles.input, { color: colors.ink, backgroundColor: colors.raised, borderColor: colors.lineStrong }]}
        />
        {!allAnswered && (
          <Text style={{ color: colors.inkFaint, fontSize: 12.5, marginTop: 12 }}>
            {QUESTIONNAIRE.filter((q) => !answers[q.id]).length} questions left — every answer sharpens the picture.
          </Text>
        )}
        <Btn
          colors={colors}
          label="Show me my future"
          disabled={!allAnswered}
          onPress={generate}
          style={{ marginTop: 16, marginBottom: 44 }}
        />
      </ScrollView>
    )

  // ---------- generating ----------
  if (step === GENERATING)
    return (
      <View style={styles.center}>
        <JarvisOrb size={120} />
        <Text style={{ color: colors.inkDim, fontSize: 15, marginTop: 8 }}>
          Coach is charting your path…
        </Text>
        <ActivityIndicator color={colors.glow} style={{ marginTop: 16 }} />
      </View>
    )

  // ---------- the narrative ----------
  if (step === NARRATIVE && result)
    return (
      <NarrativePage
        colors={colors}
        narrative={result.narrative}
        onHow={() => setStep(PATH)}
        onRedo={() => setStep(QUESTIONS)}
      />
    )

  // ---------- the path ----------
  if (step === PATH && result) {
    const everyDreamHasGoal = result.dreams.every((d) => d.goals.some((g) => g.accepted))
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pad}>
        <Kicker colors={colors}>How you get there</Kicker>
        <H1 colors={colors}>The Path</H1>
        <Text style={{ color: colors.inkDim, fontSize: 13.5, marginTop: 8, lineHeight: 20 }}>
          You chose the targets. These are the orders your daily routine executes. Tap a goal to
          decline it — at least one per dream stays.
        </Text>
        {result.dreams.map((d) => (
          <View key={d.id} style={{ marginTop: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: catColor(d.category) }} />
              <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 20, flex: 1, letterSpacing: -0.3 }}>
                {d.title}
              </Text>
              <Text style={{ color: colors.inkFaint, fontSize: 12 }}>{d.category}</Text>
            </View>
            <Card colors={colors} style={{ marginTop: 10 }}>
              {d.goals.map((g, gi) => (
                <View key={g.id} style={[gi > 0 && { borderTopWidth: 1, borderColor: colors.line, marginTop: 14, paddingTop: 14 }]}>
                  <Pressable onPress={() => toggleGoal(d.id, g.id)}>
                    <Text style={{ color: g.accepted ? colors.glow : colors.inkFaint, fontWeight: '800', fontSize: 15.5 }}>
                      {g.accepted ? '◆ ' : '◇ '}
                      {g.title}
                    </Text>
                  </Pressable>
                  {g.accepted &&
                    g.steps.map((s) => (
                      <Text key={s.id} style={{ color: colors.inkDim, fontSize: 13.5, marginLeft: 18, marginTop: 6 }}>
                        – {s.title}
                        {s.routine ? '  ↻ daily' : ''}
                      </Text>
                    ))}
                </View>
              ))}
            </Card>
          </View>
        ))}
        {!everyDreamHasGoal && (
          <Text style={{ color: colors.danger, fontSize: 13, marginTop: 14 }}>
            Each dream needs at least one accepted goal.
          </Text>
        )}
        <Btn
          colors={colors}
          label="Begin the becoming"
          disabled={!everyDreamHasGoal}
          onPress={() => onComplete(result)}
          style={{ marginTop: 22, marginBottom: 44 }}
        />
      </ScrollView>
    )
  }

  return null
}

// The dream-life story arrives word by word — quick enough to read live, never skippable-slow.
function NarrativePage({ colors, narrative, onHow, onRedo }) {
  const t = useRef(new Animated.Value(0)).current
  const words = narrative.split(/\s+/)

  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: Math.min(9000, words.length * 60),
      easing: Easing.linear,
      useNativeDriver: false,
    }).start()
  }, [narrative])

  const btns = {
    opacity: t.interpolate({ inputRange: [0.75, 0.95], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: t.interpolate({ inputRange: [0.75, 0.95], outputRange: [14, 0], extrapolate: 'clamp' }) },
    ],
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.pad, { paddingTop: 56, paddingBottom: 30 }]}>
        <Kicker colors={colors}>A day in your future life</Kicker>
        <Text style={styles.narrative}>
          {words.map((w, i) => {
            const start = i / words.length
            const end = Math.min(1, start + 3 / words.length)
            return (
              <Animated.Text
                key={i}
                style={{
                  color: colors.glow,
                  opacity: t.interpolate({ inputRange: [start, end], outputRange: [0.04, 1], extrapolate: 'clamp' }),
                }}
              >
                {w + ' '}
              </Animated.Text>
            )
          })}
        </Text>
      </ScrollView>
      <Animated.View style={[{ padding: 22, paddingTop: 6 }, btns]}>
        <Btn colors={colors} label="How do I get there?" onPress={onHow} />
        <Pressable onPress={onRedo} style={{ alignSelf: 'center', marginTop: 14, padding: 6 }}>
          <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Redo</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

// Offline fallback: stitch the answers into a tight six-sentence picture + a goal tree.
function localTree(rawAnswers, extra) {
  // chips are written first-person ("my business") — flip to second person for the story
  const a = Object.fromEntries(
    Object.entries(rawAnswers).map(([k, v]) => [k, String(v).replace(/\bmy\b/gi, 'your')]),
  )
  const narrative = [
    `You wake ${(a.wake || 'early').toLowerCase()}, and the first hour is ${(a.first || 'movement').toLowerCase()} — no phone, no noise, just the person you decided to become.`,
    `Home is ${(a.home || 'where you chose').toLowerCase()}, and it looks exactly like you said it would.`,
    `Your work is ${(a.work || 'your craft').toLowerCase()}, ${(a.hours || 'a few deep hours').toLowerCase()} of it, and money has become ${(a.money || 'freedom').toLowerCase()}.`,
    `Your body is ${(a.body || 'strong').toLowerCase()}; your spirit runs on ${(a.spirit || 'gratitude').toLowerCase()}.`,
    `Evenings are ${(a.evening || 'with the people you love').toLowerCase()}, ${(a.people || 'your people').toLowerCase()} beside you, with ${(a.travel || 'adventures').toLowerCase()} marked on the calendar.`,
    `And when people thank you, it's for ${(a.legacy || 'your example').toLowerCase()} — ${extra ? extra.trim().replace(/\.$/, '') + ' — ' : ''}all of it built one kept promise at a time.`,
  ].join(' ')

  const dreams = [
    {
      title: a.work || 'The work',
      category: 'Business',
      goals: [
        {
          title: `Make "${a.work || 'the work'}" a daily system`,
          steps: [
            { title: `${a.hours || 'Deep work'} — protect the first block`, routine: true },
            { title: 'Log one sentence on what moved', routine: true },
          ],
        },
      ],
    },
    {
      title: a.body ? `A body that is ${a.body.toLowerCase()}` : 'The body',
      category: 'Movement',
      goals: [
        {
          title: 'Train like the future self',
          steps: [
            { title: `Morning: ${a.first || 'movement'}`, routine: true },
            { title: 'Sleep 7+ hours', routine: true },
          ],
        },
      ],
    },
    {
      title: a.evening ? `Evenings: ${a.evening.toLowerCase()}` : 'The people',
      category: 'Relationship',
      goals: [
        {
          title: 'Protect the evening hours',
          steps: [
            { title: 'Phone down at dinner', routine: true },
            { title: `Plan the next: ${a.travel || 'adventure'}`, routine: false },
          ],
        },
      ],
    },
  ]
  if (extra?.trim()) {
    dreams.push({
      title: extra.trim().split('\n')[0].slice(0, 60),
      category: 'Lifestyle',
      goals: [
        {
          title: 'Name what "done" looks like',
          steps: [{ title: 'Write the 12-month version in one paragraph', routine: false }],
        },
      ],
    })
  }
  return { narrative, dreams }
}

const styles = StyleSheet.create({
  pad: { padding: 22, paddingTop: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  welcomeTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center', marginTop: -2 },
  welcomeSub: { fontSize: 15.5, textAlign: 'center', marginTop: 12, lineHeight: 23, paddingHorizontal: 6 },
  narrative: { fontSize: 22, fontWeight: '700', lineHeight: 35, letterSpacing: -0.2, marginTop: 6 },
  qRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    paddingVertical: 16,
  },
  chipCol: { width: 150, gap: 6 },
  chip: { borderWidth: 1, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    minHeight: 110,
    marginTop: 12,
    textAlignVertical: 'top',
  },
})
