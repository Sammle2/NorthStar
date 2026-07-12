import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CalendarClock, Check, Plus, Sparkles, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import { CATEGORY_COLORS } from '../mockData'
import { generateSprintPlan, judgeSprint } from '../../services/aiService'
import { validateGoal } from '../aiEngine'

// Sprints — capture a short-term task, pick when it's due, and Nova breaks it
// into a scheduled plan: a few steps across the remaining hours if it's due
// today, or across the days if it's further out. Each step carries a real
// target date, so the labels ("due today", "in 3 days", "2 days overdue")
// recompute every time you open the app, keeping you on schedule.
const DUE_OPTIONS = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'week', label: 'This week', days: 7 },
  { id: 'month', label: 'This month', days: 30 },
  { id: 'custom', label: 'Custom', days: null },
]

let sid = 0
const newId = () => `sp${Date.now()}_${sid++}`

// ── Scheduling helpers ──────────────────────────────────────────────────────
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const dayDiff = (iso) => Math.round((startOfDay(iso).getTime() - startOfDay(new Date()).getTime()) / 86400000)
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// How many steps for a given horizon: a few for "today", up to ~7 for longer.
const stepCount = (horizonDays) => (horizonDays <= 0 ? 4 : Math.min(7, Math.max(2, horizonDays)))

// Assign each step title a real target datetime. Today → spread over the
// remaining hours; longer → spread evenly across the days (consecutive when the
// step count matches the day count).
function buildSchedule(titles, horizonDays) {
  const now = new Date()
  const n = titles.length
  const mk = (t, i, iso) => ({ id: `st${Date.now()}_${i}`, title: t, targetDate: iso, completed: false })

  if (horizonDays <= 0) {
    const start = new Date(now.getTime() + 15 * 60000) // ~now
    let end = new Date(now); end.setHours(21, 0, 0, 0) // wind down by 9pm
    if (end.getTime() - start.getTime() < n * 30 * 60000) end = new Date(start.getTime() + n * 45 * 60000)
    return titles.map((t, i) => {
      const frac = (i + 1) / (n + 1)
      return mk(t, i, new Date(start.getTime() + frac * (end.getTime() - start.getTime())).toISOString())
    })
  }
  return titles.map((t, i) => {
    // Spread steps across the window; a lone step (e.g. the AI-failed fallback)
    // lands on the due day, not today — otherwise a "this month" sprint shows
    // "due today".
    const offset = n > 1 ? Math.round((i * (horizonDays - 1)) / (n - 1)) : Math.max(0, horizonDays - 1)
    const d = new Date(now); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() + offset)
    return mk(t, i, d.toISOString())
  })
}

// Live, relative schedule label for a step — recomputed on every render.
function schedLabel(iso, completed, hourly) {
  if (completed) return { text: 'done', color: C.green }
  if (!iso) return { text: '', color: C.faint }
  const d = dayDiff(iso)
  if (d > 1) return { text: `in ${d} days`, color: C.faint }
  if (d === 1) return { text: 'due tomorrow', color: C.amber }
  if (d === 0) return { text: hourly ? `by ${fmtTime(iso)}` : 'due today', color: C.amber }
  if (d === -1) return { text: '1 day overdue', color: C.red }
  return { text: `${-d} days overdue`, color: C.red }
}

const isDone = (s) => (s.steps?.length ? s.steps.every((st) => st.completed) : !!s.completed)

// Shown when the local gate rejects a sprint (gibberish/impossible), or as a
// fallback if the AI judge rejects without a message. The AI usually supplies a
// tailored, tone-matched line instead.
const SPRINT_CLARIFY = 'Give me a real task I can actually plan — something specific you want to get done. Try naming the outcome, like “Finish my résumé” or “Study for Friday’s exam.”'

export default function Sprints({ profile, onUpdate }) {
  const sprints = profile.sprints || []
  const goals = profile.goals || []
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('week')
  const [customDays, setCustomDays] = useState('')
  const [linkedGoalId, setLinkedGoalId] = useState(null)
  const [phase, setPhase] = useState(null) // null | 'judging' | 'planning' — drives the busy label
  const [error, setError] = useState('')
  const [gate, setGate] = useState(null) // { message } — the "make it more specific" popup
  const [rejected, setRejected] = useState([]) // titles the judge already turned down (attempt-aware)

  const ready = !!title.trim() && !phase

  const horizonDays = () => {
    const opt = DUE_OPTIONS.find((o) => o.id === due)
    if (opt && opt.days != null) return opt.days
    const n = parseInt(customDays, 10)
    return Number.isFinite(n) && n > 0 ? n : 5
  }
  const dueLabelText = () => {
    const opt = DUE_OPTIONS.find((o) => o.id === due)
    if (due === 'custom') { const n = horizonDays(); return `${n} day${n === 1 ? '' : 's'}` }
    return opt ? opt.label : 'This week'
  }

  const reset = () => {
    setTitle(''); setDue('week'); setCustomDays(''); setLinkedGoalId(null); setError(''); setRejected([])
  }

  const add = async () => {
    if (!ready) return
    const raw = title.trim()
    setError('') // clear any prior build-failure line on every attempt (incl. the gate paths)
    const H = horizonDays()

    // Gate: make sure the sprint is a real, attainable task before Nova plans it.
    // (1) Fast local check — catches gibberish/impossible even when the AI is down.
    const local = validateGoal(raw)
    if (!local.ok) {
      setRejected((r) => [...r, raw])
      setGate({ message: SPRINT_CLARIFY })
      return
    }

    setPhase('judging')
    // (2) AI judge — attempt-aware AND horizon-aware; holds the same bar across
    // retries (mirrors the onboarding goal gate). Fails open, so an API hiccup
    // never blocks a sprint.
    const verdict = await judgeSprint({
      rawTitle: raw,
      horizonDays: H,
      name: profile.name,
      tone: profile.coachTone || 'default',
      attempt: rejected.length + 1,
      rejected,
    })
    if (!verdict.ok) {
      setRejected((r) => [...r, raw])
      setGate({ message: verdict.message || SPRINT_CLARIFY })
      setPhase(null)
      return
    }

    setPhase('planning')
    try {
      let titles
      try {
        titles = await generateSprintPlan({ title: raw, horizonDays: H, count: stepCount(H), tone: profile.coachTone || 'default' })
      } catch (e) {
        titles = [raw] // fallback: the task itself as a single scheduled step
      }
      const steps = buildSchedule(titles, H)
      const g = goals.find((x) => x.id === linkedGoalId)
      const sprint = {
        id: newId(),
        title: raw,
        due: dueLabelText(),
        horizonDays: H,
        dueDate: steps[steps.length - 1]?.targetDate,
        steps,
        completed: false,
        createdAt: new Date().toISOString(),
        ...(g ? { linkedGoalId: g.id, goalTitle: g.title, goalCategory: g.category } : {}),
      }
      // Functional updater: this write lands AFTER the ~1-3s AI call, so it must
      // merge onto the CURRENT profile — otherwise a step the user toggled on an
      // existing sprint (or any other change) during the wait gets clobbered.
      onUpdate((prof) => ({ ...prof, sprints: [sprint, ...(prof.sprints || [])] }))
      reset()
    } catch (e) {
      setError(e?.message || 'Could not build the plan. Try again.')
    } finally {
      setPhase(null)
    }
  }

  const toggleStep = (sprintId, stepId) =>
    onUpdate({
      ...profile,
      sprints: sprints.map((s) =>
        s.id !== sprintId ? s : { ...s, steps: (s.steps || []).map((st) => (st.id === stepId ? { ...st, completed: !st.completed } : st)) },
      ),
    })
  const toggleSprint = (id) =>
    onUpdate({ ...profile, sprints: sprints.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)) })
  const remove = (id) => onUpdate({ ...profile, sprints: sprints.filter((s) => s.id !== id) })

  const active = sprints.filter((s) => !isDone(s))
  const done = sprints.filter(isDone)

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 130, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 }}>
          <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 3 }}>SHORT-TERM</Text>
          <Text style={{ fontFamily: F.display, fontSize: 30, color: C.ink, letterSpacing: 1.4, lineHeight: 38 }}>SPRINTS</Text>
          <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, marginTop: 6, lineHeight: 20 }}>
            Name a task, pick when it’s due, and Nova builds you a step-by-step plan on a schedule — hours if it’s today, days if it’s further out.
          </Text>
        </View>

        {/* Add form */}
        <View style={{ marginHorizontal: 24, borderRadius: 18, padding: 18, backgroundColor: 'rgba(13,13,27,0.85)', borderWidth: 1, borderColor: C.lineMid }}>
          <Text style={{ fontFamily: F.display, fontSize: 10.5, color: C.violet, letterSpacing: 1.6, marginBottom: 12 }}>NEW SPRINT</Text>
          <TextInput
            value={title}
            onChangeText={(v) => { setTitle(v); if (rejected.length) setRejected([]) }}
            placeholder="e.g. Ace my chemistry midterm"
            placeholderTextColor={C.faint2}
            autoComplete="off"
            style={inputStyle}
          />

          {/* Due */}
          <Text style={subLabel}>WHEN'S IT DUE?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DUE_OPTIONS.map((d) => (
              <Chip key={d.id} icon label={d.label} on={due === d.id} onPress={() => setDue(d.id)} />
            ))}
          </View>
          {due === 'custom' && (
            <TextInput
              value={customDays}
              onChangeText={setCustomDays}
              placeholder="How many days? e.g. 5"
              placeholderTextColor={C.faint2}
              keyboardType="number-pad"
              autoComplete="off"
              style={[inputStyle, { marginTop: 10 }]}
            />
          )}

          {/* Optional goal link */}
          {goals.length > 0 && (
            <>
              <Text style={subLabel}>PART OF A GOAL? (OPTIONAL)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {goals.map((g) => {
                  const color = CATEGORY_COLORS[g.category] || C.amber
                  const on = linkedGoalId === g.id
                  return (
                    <Pressable key={g.id} onPress={() => setLinkedGoalId(on ? null : g.id)} style={{ borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: on ? color + '22' : 'transparent', borderWidth: 1, borderColor: on ? color : C.lineStrong }}>
                      <Text style={{ fontFamily: on ? F.semibold : F.body, fontSize: 12, color: on ? color : C.dim }}>
                        {g.title.length > 24 ? g.title.slice(0, 24) + '…' : g.title}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </>
          )}

          {error ? <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.red, marginTop: 12 }}>{error}</Text> : null}

          {/* Add */}
          <Pressable onPress={add} disabled={!ready} style={{ marginTop: 16 }}>
            {ready ? (
              <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13 }}>
                <Sparkles size={16} color={C.amberInk} strokeWidth={2.6} />
                <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.amberInk }}>Add sprint + build plan</Text>
              </LinearGradient>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.line }}>
                {phase ? (
                  <>
                    <ActivityIndicator size="small" color={C.violet} />
                    <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.dim }}>
                      {phase === 'judging' ? 'Nova is checking your sprint…' : 'Nova is planning your steps…'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Plus size={16} color={C.faint2} strokeWidth={2.6} />
                    <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.faint2 }}>Name your sprint</Text>
                  </>
                )}
              </View>
            )}
          </Pressable>
        </View>

        {/* Active */}
        <View style={{ paddingHorizontal: 24, marginTop: 24, gap: 12 }}>
          <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 2.2 }}>IN PROGRESS · {active.length}</Text>
          {active.length === 0 && <Text style={{ fontFamily: F.body, fontSize: 13, color: C.faint, fontStyle: 'italic' }}>Nothing on deck. Add a sprint above.</Text>}
          {active.map((s) => (
            <SprintCard key={s.id} sprint={s} onToggleStep={toggleStep} onToggleSprint={toggleSprint} onRemove={() => remove(s.id)} />
          ))}
        </View>

        {/* Done */}
        {done.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 24, gap: 12 }}>
            <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 2.2 }}>DONE · {done.length}</Text>
            {done.map((s) => (
              <SprintCard key={s.id} sprint={s} onToggleStep={toggleStep} onToggleSprint={toggleSprint} onRemove={() => remove(s.id)} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Goal-quality gate — Nova asks for a more specific / attainable sprint.
          The typed title stays in the field so they can refine it and retry. */}
      {gate && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,7,15,0.86)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 300 }}>
          <View style={{ width: '100%', maxWidth: 400, borderRadius: 22, padding: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.lineMid }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, alignSelf: 'center' }}>
              <Sparkles size={22} color={C.violet} strokeWidth={2.2} />
            </View>
            <Text style={{ fontFamily: F.display, fontSize: 17, color: C.ink, letterSpacing: 0.4, textAlign: 'center', marginTop: 14 }}>Let’s sharpen this sprint</Text>
            <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, lineHeight: 21, textAlign: 'center', marginTop: 10 }}>{gate.message}</Text>
            <Pressable onPress={() => setGate(null)} style={{ marginTop: 20 }}>
              <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.amberInk }}>Edit my sprint</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

// A sprint with its scheduled plan. Falls back to a simple row for legacy
// sprints saved before planning existed (no steps array).
function SprintCard({ sprint, onToggleStep, onToggleSprint, onRemove }) {
  const goalColor = sprint.goalCategory ? CATEGORY_COLORS[sprint.goalCategory] || C.violet : C.violet
  const steps = sprint.steps || []
  const hourly = sprint.horizonDays <= 0
  const doneCount = steps.filter((s) => s.completed).length
  const allDone = isDone(sprint)
  const overdue = !allDone && steps.some((s) => !s.completed && dayDiff(s.targetDate) < 0)

  // Legacy sprint (pre-planning): keep the old single-checkbox row.
  if (!steps.length) {
    return (
      <View style={rowWrap(allDone)}>
        <Pressable onPress={() => onToggleSprint(sprint.id)} hitSlop={8}>
          <View style={checkbox(allDone)}>{allDone && <Check size={14} color={C.bg} strokeWidth={3} />}</View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.medium, fontSize: 14.5, color: allDone ? C.faint : C.ink, textDecorationLine: allDone ? 'line-through' : 'none' }}>{sprint.title}</Text>
          {!!sprint.due && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <CalendarClock size={11} color={C.amber} strokeWidth={2} />
              <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.amber }}>{sprint.due}</Text>
            </View>
          )}
        </View>
        <Pressable onPress={onRemove} hitSlop={8}><X size={16} color={C.faint2} strokeWidth={2.2} /></Pressable>
      </View>
    )
  }

  const overall = schedLabel(sprint.dueDate, allDone, false)

  return (
    <View style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: allDone ? 'rgba(16,185,129,0.06)' : 'rgba(13,13,27,0.8)', borderWidth: 1, borderColor: allDone ? 'rgba(16,185,129,0.25)' : overdue ? 'rgba(239,68,68,0.35)' : C.line }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 15, color: allDone ? C.faint : C.ink, textDecorationLine: allDone ? 'line-through' : 'none' }}>{sprint.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <CalendarClock size={11} color={overall.color} strokeWidth={2} />
              <Text style={{ fontFamily: F.medium, fontSize: 11.5, color: overall.color }}>{allDone ? 'complete' : overall.text}</Text>
            </View>
            <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint }}>· {doneCount}/{steps.length} steps</Text>
            {sprint.goalTitle && (
              <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: goalColor + '1f', borderWidth: 1, borderColor: goalColor + '40' }}>
                <Text style={{ fontFamily: F.medium, fontSize: 10.5, color: goalColor }}>{sprint.goalTitle.length > 20 ? sprint.goalTitle.slice(0, 20) + '…' : sprint.goalTitle}</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable onPress={onRemove} hitSlop={8}><X size={16} color={C.faint2} strokeWidth={2.2} /></Pressable>
      </View>

      {/* Steps */}
      <View style={{ marginTop: 12, gap: 2 }}>
        {steps.map((st) => {
          const lab = schedLabel(st.targetDate, st.completed, hourly)
          return (
            <Pressable key={st.id} onPress={() => onToggleStep(sprint.id, st.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: st.completed ? C.green : C.faint3, backgroundColor: st.completed ? C.green : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {st.completed && <Check size={12} color={C.bg} strokeWidth={3} />}
              </View>
              <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 13.5, color: st.completed ? C.faint : C.ink2, textDecorationLine: st.completed ? 'line-through' : 'none' }}>{st.title}</Text>
              <Text style={{ fontFamily: F.semibold, fontSize: 11, color: lab.color }}>{lab.text}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function Chip({ label, on, onPress, icon }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: on ? 'rgba(245,158,11,0.16)' : C.violetFill07, borderWidth: 1, borderColor: on ? C.amber : C.lineMid }}>
      {icon && <CalendarClock size={12} color={on ? C.amber : C.dim} strokeWidth={2} />}
      <Text style={{ fontFamily: on ? F.semibold : F.body, fontSize: 12.5, color: on ? C.amber : C.dim }}>{label}</Text>
    </Pressable>
  )
}

const rowWrap = (done) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: done ? 'rgba(16,185,129,0.06)' : 'rgba(13,13,27,0.8)', borderWidth: 1, borderColor: done ? 'rgba(16,185,129,0.25)' : C.line })
const checkbox = (done) => ({ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: done ? C.green : C.faint3, backgroundColor: done ? C.green : 'transparent', alignItems: 'center', justifyContent: 'center' })

const subLabel = { fontFamily: F.display, fontSize: 10, color: C.faint, letterSpacing: 1.5, marginTop: 16, marginBottom: 8 }
const inputStyle = {
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
