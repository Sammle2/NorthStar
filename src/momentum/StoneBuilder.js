// ── Momentum roadmap: the setup flow ─────────────────────────────────────────
// Turns a Dream into a momentum mechanism, IN ORDER: name the OUTCOME (goal step,
// with optional NOVA ideas) → size the gap (where you're starting + how big) →
// Claude proposes an ordered checkpoint breakdown → user edits / reorders →
// optional lever split → Claude drafts the first checkpoint's tasks → accept.
// Nothing goes live until the user accepts. A self-contained full-screen overlay.
import React, { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2, X } from 'lucide-react-native'
import { C, F } from '../app/tokens'
import { GAP_SIZES } from './model'
import { CATEGORIES, CATEGORY_LABELS, normalizeCategory } from '../app/mockData'
import { decomposeIntoStones, generateStoneTasks, suggestLevers, normalizeWeights } from './generate'
import { generateGoalsForFocus } from '../services/aiService'
import { adoptMechanism } from './store'

// Category-relevant "where you're starting" examples — the placeholder shows the
// first, and all three appear as a muted hint. Body-only cues like "200 lbs"
// never leak into Mind/Spirit/etc.
const STARTING_EXAMPLES = {
  mind: ['distracted most days', "haven't finished a book in a year", 'focus feels scattered'],
  body: ['200 lbs now', 'can run 1 mile', 'sedentary, low energy'],
  spirit: ['anxious and restless', 'no daily practice', 'feel disconnected from meaning'],
  work: ['$0 saved', '0 clients', 'stuck in a job I dislike'],
  relationships: ['drifted from close friends', 'rarely see family', 'no weekly connection'],
}

const CADENCE_PRESETS = [
  { id: 'daily', label: 'Every day', value: 'daily' },
  { id: 'weekdays', label: 'Weekdays', value: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { id: 'mwf', label: 'Mon·Wed·Fri', value: ['mon', 'wed', 'fri'] },
  { id: 'weekend', label: 'Weekends', value: ['sat', 'sun'] },
]

// Experience feeds NOVA's stone + task sizing: a beginner gets more, smaller
// stones and gentler tasks; an expert gets fewer, harder ones.
const EXPERIENCE_LEVELS = [
  { id: 'new', label: 'New to this' },
  { id: 'some', label: 'Some experience' },
  { id: 'experienced', label: 'Experienced' },
]

export default function StoneBuilder({ goal, onUpdate, onClose, situation = '' }) {
  const [step, setStep] = useState('goal') // goal | gap | stones | tasks
  const [title, setTitle] = useState(goal?.title || '') // the outcome they're chasing
  const [suggestions, setSuggestions] = useState([]) // NOVA's outcome-title ideas
  const [sugBusy, setSugBusy] = useState(false)
  const [gap, setGap] = useState('stretch')
  const [stones, setStones] = useState([])
  const [levers, setLevers] = useState([]) // [{title, weight}]
  const [useLevers, setUseLevers] = useState(false)
  const [tasks, setTasks] = useState([]) // first-stone tasks
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [experience, setExperience] = useState('')
  const [startPoint, setStartPoint] = useState('') // where they are now (current state)

  const category = goal?.category || ''
  const catKey = normalizeCategory(goal?.category)
  const catLabel = CATEGORY_LABELS[catKey] || 'this area'
  const catBlurb = (CATEGORIES.find((c) => c.key === catKey) || {}).blurb || ''
  const startingExamples = STARTING_EXAMPLES[catKey] || STARTING_EXAMPLES.mind

  // Persist the (possibly renamed) outcome onto the goal so the header, checkpoint
  // generation, and the roadmap all read the same title.
  const commitTitle = () => {
    const t = title.trim()
    if (!t || t === goal?.title) return
    onUpdate((prof) => ({ ...prof, goals: (prof?.goals || []).map((g) => (g.id === goal.id ? { ...g, title: t } : g)) }))
  }

  // Goal step → gap step. Names the outcome first, then sizes the leap.
  const goToGap = () => {
    if (!title.trim()) { setNote('Give your goal a name first.'); return }
    commitTitle()
    setNote(null)
    setStep('gap')
  }

  // Optional NOVA assist: a few OUTCOME-focused titles for this category to pick
  // from (each still editable). Grounded in what they're already carrying.
  const askNova = async () => {
    setSugBusy(true)
    setNote(null)
    try {
      const ai = await generateGoalsForFocus({ focus: { [catKey]: 3 }, pursuing: situation, name: '' })
      const ideas = (ai || []).filter((x) => normalizeCategory(x.category) === catKey).map((x) => String(x.title || '').trim()).filter(Boolean)
      setSuggestions(ideas.slice(0, 3))
      if (!ideas.length) setNote("Couldn't reach NOVA — name it yourself.")
    } catch (e) {
      setNote("Couldn't reach NOVA — name it yourself.")
    }
    setSugBusy(false)
  }

  // gap chosen → ask Claude for checkpoints + a possible lever split in parallel.
  const chooseGap = async (g) => {
    setGap(g)
    setBusy(true)
    setNote('Mapping your checkpoints…')
    const [proposed, suggestedLevers] = await Promise.all([
      decomposeIntoStones({ title: title.trim() || goal.title, category, categoryBlurb: catBlurb, gap: g, situation, currentState: startPoint, experience }),
      suggestLevers({ title: title.trim() || goal.title, category }),
    ])
    setStones(proposed.length ? proposed : [blankStone()])
    if (suggestedLevers.length) { setLevers(suggestedLevers); setUseLevers(true) }
    setBusy(false)
    setNote(proposed.length ? null : "Couldn't reach the AI — add your checkpoints by hand.")
    setStep('stones')
  }

  const blankStone = () => ({ title: '', targetMetric: '', targetValue: null, targetUnit: '', direction: 'up' })

  const editStone = (i, patch) => setStones((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const removeStone = (i) => setStones((prev) => prev.filter((_, j) => j !== i))
  const moveStone = (i, dir) => setStones((prev) => {
    const j = i + dir
    if (j < 0 || j >= prev.length) return prev
    const next = [...prev]; const t = next[i]; next[i] = next[j]; next[j] = t; return next
  })

  const editLever = (i, patch) => setLevers((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const removeLever = (i) => setLevers((prev) => prev.filter((_, j) => j !== i))
  const addLever = () => setLevers((prev) => [...prev, { title: '', weight: null }])

  // stones accepted → draft the first (current) stone's tasks.
  const toTasks = async () => {
    const clean = stones.filter((s) => (s.title || '').trim() || (s.targetMetric || '').trim())
    if (!clean.length) { setNote('Add at least one checkpoint.'); return }
    setStones(clean)
    setBusy(true)
    setNote('Drafting your first tasks…')
    const activeLevers = useLevers ? normalizeWeights(levers.filter((l) => (l.title || '').trim())) : []
    const drafted = await generateStoneTasks({ dreamTitle: title.trim() || goal.title, category, categoryBlurb: catBlurb, stone: clean[0], levers: activeLevers, experience })
    setTasks(drafted.length ? drafted : [{ title: '', type: 'habit', cadenceDays: 'daily', lever: null }])
    setBusy(false)
    setNote(null)
    setStep('tasks')
  }

  const editTask = (i, patch) => setTasks((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const removeTask = (i) => setTasks((prev) => prev.filter((_, j) => j !== i))
  const addTask = () => setTasks((prev) => [...prev, { title: '', type: 'habit', cadenceDays: 'daily', lever: null }])

  const finish = () => {
    const activeLevers = useLevers ? normalizeWeights(levers.filter((l) => (l.title || '').trim())) : []
    const cleanTasks = tasks.filter((t) => (t.title || '').trim())
    const built = stones.map((s, i) => ({ ...s, tasks: i === 0 ? cleanTasks : [] }))
    adoptMechanism(onUpdate, goal.id, { gap, levers: activeLevers, stones: built, experience, currentState: startPoint })
    onClose && onClose(true)
  }

  return (
    <Overlay onRequestClose={() => onClose && onClose(false)}>
      <Header
        title={title.trim() || goal?.title || 'New Dream'}
        onBack={step === 'goal' ? null : () => setStep(step === 'tasks' ? 'stones' : step === 'stones' ? 'gap' : 'goal')}
        onClose={() => onClose && onClose(false)}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
        {step === 'goal' && (
          <View>
            <Kicker>Name your goal</Kicker>
            <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, marginTop: 6, lineHeight: 19 }}>
              What do you want to become or achieve in {catLabel}? Aim for the OUTCOME — “Become a Confident Runner”, not “Run 3× a week”. The daily habits become tasks; the numbers become checkpoints.
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={`Your ${catLabel} goal`}
              placeholderTextColor={C.faint}
              multiline
              style={{ backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.lineMid, paddingHorizontal: 12, paddingVertical: 12, color: C.ink, fontFamily: F.semibold, fontSize: 15, marginTop: 14, marginBottom: 12 }}
            />
            <Pressable onPress={askNova} disabled={sugBusy} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid }}>
              {sugBusy ? <ActivityIndicator size={13} color={C.violet} /> : <Sparkles size={14} color={C.violet} strokeWidth={2.3} />}
              <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.violet }}>{sugBusy ? 'NOVA is thinking…' : 'Ask NOVA for ideas'}</Text>
            </Pressable>
            {suggestions.length > 0 && (
              <View style={{ marginTop: 14, gap: 8 }}>
                {suggestions.map((s, i) => {
                  const on = title.trim() === s
                  return (
                    <Pressable key={i} onPress={() => setTitle(s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: on ? C.violetFill : C.card, borderWidth: 1, borderColor: on ? C.violet : C.line }}>
                      <Sparkles size={13} color={C.violet} strokeWidth={2.2} />
                      <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 13.5, color: C.ink2 }}>{s}</Text>
                    </Pressable>
                  )
                })}
                <Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint, marginTop: 2 }}>Tap one to use it — you can still edit it.</Text>
              </View>
            )}
          </View>
        )}

        {step === 'gap' && (
          <View>
            <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.faint, letterSpacing: 1, marginBottom: 8 }}>YOUR EXPERIENCE</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {EXPERIENCE_LEVELS.map((e) => {
                const on = experience === e.label
                return (
                  <Pressable key={e.id} onPress={() => setExperience(on ? '' : e.label)} style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: on ? C.violet : C.violetFill07, borderWidth: 1, borderColor: on ? C.violet : C.lineMid }}>
                    <Text style={{ fontFamily: on ? F.bold : F.medium, fontSize: 11, color: on ? C.amberInk : C.dim, textAlign: 'center' }}>{e.label}</Text>
                  </Pressable>
                )
              })}
            </View>
            <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.faint, letterSpacing: 1, marginBottom: 8 }}>WHERE YOU'RE STARTING (optional)</Text>
            <TextInput
              value={startPoint}
              onChangeText={setStartPoint}
              placeholder={`e.g. ${startingExamples[0]}`}
              placeholderTextColor={C.faint}
              style={{ backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.lineMid, paddingHorizontal: 11, paddingVertical: 10, color: C.ink, fontFamily: F.medium, fontSize: 13.5 }}
            />
            <Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint, marginTop: 7, marginBottom: 22, lineHeight: 16 }}>
              e.g. {startingExamples.join('  ·  ')}
            </Text>
            <Kicker>How big is this leap?</Kicker>
            <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, marginTop: 6, marginBottom: 18, lineHeight: 19 }}>
              This only sets how many checkpoints we lay between you and the summit — no dates, ever.
            </Text>
            {GAP_SIZES.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => chooseGap(g.id)}
                disabled={busy}
                style={({ pressed }) => ({ marginBottom: 12, borderRadius: 16, padding: 18, backgroundColor: pressed ? C.violetFill : C.card, borderWidth: 1, borderColor: pressed ? C.violet : C.line })}
              >
                <Text style={{ fontFamily: F.semibold, fontSize: 16, color: C.ink }}>{g.label}</Text>
                <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginTop: 4 }}>{g.hint}</Text>
                <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.violet, marginTop: 8, letterSpacing: 0.6 }}>{g.stones[0]}–{g.stones[1]} CHECKPOINTS</Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === 'stones' && (
          <View>
            <Kicker>Your checkpoints</Kicker>
            <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginTop: 6, marginBottom: 16, lineHeight: 18 }}>
              Ordered checkpoints, each a real number you'll hit. Edit, reorder, or add your own.
            </Text>
            {stones.map((s, i) => (
              <View key={i} style={{ marginBottom: 12, borderRadius: 16, padding: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.violetFill, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 11, color: C.violet }}>{i + 1}</Text>
                  </View>
                  <Field value={s.title} onChangeText={(t) => editStone(i, { title: t })} placeholder="Checkpoint name" style={{ flex: 1 }} />
                  <Pressable onPress={() => moveStone(i, -1)} hitSlop={6}><ArrowUp size={16} color={i === 0 ? C.faint3 : C.dim} /></Pressable>
                  <Pressable onPress={() => moveStone(i, 1)} hitSlop={6}><ArrowDown size={16} color={i === stones.length - 1 ? C.faint3 : C.dim} /></Pressable>
                  <Pressable onPress={() => removeStone(i)} hitSlop={6}><Trash2 size={15} color={C.faint} /></Pressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <Field value={s.targetMetric} onChangeText={(t) => editStone(i, { targetMetric: t })} placeholder="metric" style={{ flex: 1.4 }} />
                  <Field value={s.targetValue == null ? '' : String(s.targetValue)} onChangeText={(t) => editStone(i, { targetValue: t.replace(/[^0-9.\-]/g, '') })} placeholder="value" keyboardType="numeric" style={{ flex: 1 }} />
                  <Field value={s.targetUnit} onChangeText={(t) => editStone(i, { targetUnit: t })} placeholder="unit" style={{ flex: 1 }} />
                  <Pressable
                    onPress={() => editStone(i, { direction: s.direction === 'down' ? 'up' : 'down' })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid }}
                  >
                    {s.direction === 'down' ? <ArrowDown size={13} color={C.sky} /> : <ArrowUp size={13} color={C.green} />}
                  </Pressable>
                </View>
              </View>
            ))}
            <GhostButton icon={Plus} label="Add a checkpoint" onPress={() => setStones((p) => [...p, blankStone()])} />

            {/* Optional levers */}
            <View style={{ marginTop: 22 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Kicker>Levers (optional)</Kicker>
                <Pressable onPress={() => setUseLevers((v) => !v)} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: useLevers ? C.violet : C.violetFill07, borderWidth: 1, borderColor: useLevers ? C.violet : C.lineMid }}>
                  <Text style={{ fontFamily: F.semibold, fontSize: 11.5, color: useLevers ? C.amberInk : C.violet }}>{useLevers ? 'On' : 'Off'}</Text>
                </Pressable>
              </View>
              <Text style={{ fontFamily: F.body, fontSize: 12, color: C.dim, marginTop: 6, lineHeight: 18 }}>
                Split this Dream into parallel areas (e.g. Diet + Exercise), each weighted. Skip it for single-track goals.
              </Text>
              {useLevers && (
                <View style={{ marginTop: 12 }}>
                  {levers.map((l, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Field value={l.title} onChangeText={(t) => editLever(i, { title: t })} placeholder="Lever name" style={{ flex: 1 }} />
                      <Field value={l.weight == null ? '' : String(l.weight)} onChangeText={(t) => editLever(i, { weight: t.replace(/[^0-9.]/g, '') })} placeholder="0.5" keyboardType="numeric" style={{ width: 64 }} />
                      <Pressable onPress={() => removeLever(i)} hitSlop={6}><Trash2 size={15} color={C.faint} /></Pressable>
                    </View>
                  ))}
                  <GhostButton icon={Plus} label="Add a lever" onPress={addLever} />
                </View>
              )}
            </View>
          </View>
        )}

        {step === 'tasks' && (
          <View>
            <Kicker>Tasks for checkpoint 1</Kicker>
            <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginTop: 6, marginBottom: 16, lineHeight: 18 }}>
              The daily moves toward "{stones[0]?.title || 'your first stone'}". One tap a day marks each done — that's all momentum needs.
            </Text>
            {tasks.map((t, i) => (
              <View key={i} style={{ marginBottom: 12, borderRadius: 16, padding: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Field value={t.title} onChangeText={(v) => editTask(i, { title: v })} placeholder="Task" style={{ flex: 1 }} />
                  <Pressable onPress={() => removeTask(i)} hitSlop={6}><Trash2 size={15} color={C.faint} /></Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 6 }}>
                  {CADENCE_PRESETS.map((c) => {
                    const on = JSON.stringify(t.cadenceDays) === JSON.stringify(c.value)
                    return (
                      <Chip key={c.id} on={on} label={c.label} onPress={() => editTask(i, { type: 'schedule', cadenceDays: c.value })} />
                    )
                  })}
                  <Chip on={t.type === 'one_off'} label="Once" onPress={() => editTask(i, { type: 'one_off', cadenceDays: null })} />
                </ScrollView>
                {useLevers && levers.filter((l) => l.title).length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 6 }}>
                    <Chip on={!t.lever} label="No lever" onPress={() => editTask(i, { lever: null })} accent={C.faint} />
                    {levers.filter((l) => l.title).map((l) => (
                      <Chip key={l.title} on={t.lever === l.title} label={l.title} onPress={() => editTask(i, { lever: l.title })} />
                    ))}
                  </ScrollView>
                )}
              </View>
            ))}
            <GhostButton icon={Plus} label="Add a task" onPress={addTask} />
          </View>
        )}

        {note && (
          <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginTop: 16, textAlign: 'center' }}>{note}</Text>
        )}
        {busy && <ActivityIndicator color={C.violet} style={{ marginTop: 20 }} />}
      </ScrollView>

      {/* Footer action */}
      {!busy && step !== 'gap' && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 30, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line }}>
          <Pressable
            onPress={step === 'goal' ? goToGap : step === 'stones' ? toTasks : finish}
            disabled={step === 'goal' && !title.trim()}
            style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: C.amber, flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: step === 'goal' && !title.trim() ? 0.5 : 1 }}
          >
            {step === 'goal' ? <ChevronRight size={17} color={C.amberInk} strokeWidth={2.6} /> : step === 'tasks' ? <Check size={17} color={C.amberInk} strokeWidth={2.6} /> : <Sparkles size={16} color={C.amberInk} strokeWidth={2.4} />}
            <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: C.amberInk }}>{step === 'goal' ? 'Continue' : step === 'stones' ? 'Draft my tasks' : 'Start this Dream'}</Text>
          </Pressable>
        </View>
      )}
    </Overlay>
  )
}

// ── small shared bits ────────────────────────────────────────────────────────
// A Modal, not an absolutely-positioned View — this flow is mounted deep inside
// StoneTrack (itself inside a ScrollView), where RN's parent-relative absolute
// positioning would size the "overlay" to its container instead of the screen.
function Overlay({ children, onRequestClose }) {
  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onRequestClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>{children}</View>
    </Modal>
  )
}

function Header({ title, onBack, onClose }) {
  return (
    <View style={{ paddingTop: 52, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8}><ChevronLeft size={22} color={C.dim} /></Pressable>
      ) : <View style={{ width: 22 }} />}
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.display, fontSize: 16, color: C.ink, letterSpacing: 0.5 }}>{title}</Text>
      <Pressable onPress={onClose} hitSlop={8}><X size={20} color={C.dim} /></Pressable>
    </View>
  )
}

function Kicker({ children }) {
  return <Text style={{ fontFamily: F.display, fontSize: 12, color: C.faint, letterSpacing: 2 }}>{String(children).toUpperCase()}</Text>
}

function Field({ style, ...props }) {
  return (
    <TextInput
      placeholderTextColor={C.faint}
      style={[{ backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.lineMid, paddingHorizontal: 11, paddingVertical: 9, color: C.ink, fontFamily: F.medium, fontSize: 13.5 }, style]}
      {...props}
    />
  )
}

function Chip({ on, label, onPress, accent = C.violet }) {
  return (
    <Pressable onPress={onPress} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: on ? accent : C.violetFill07, borderWidth: 1, borderColor: on ? accent : C.lineMid }}>
      <Text style={{ fontFamily: on ? F.bold : F.medium, fontSize: 11.5, color: on ? C.amberInk : C.dim }}>{label}</Text>
    </Pressable>
  )
}

function GhostButton({ icon: Icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 12, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid, borderStyle: 'dashed' }}>
      <Icon size={15} color={C.violet} />
      <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.violet }}>{label}</Text>
    </Pressable>
  )
}
