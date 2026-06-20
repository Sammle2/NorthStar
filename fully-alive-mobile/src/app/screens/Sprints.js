import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CalendarClock, Check, Plus, Sparkles, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import { CATEGORY_COLORS } from '../mockData'
import { buildGoal } from '../aiEngine'
import dailyActionGenerator from '../../services/dailyActionGenerator'

// Short-term milestones — quick, deadline-driven things ("a test coming up").
// On add, the user says whether it belongs to a goal they're pursuing, starts a
// new bigger goal, or stands alone. Lives on profile.sprints (+ may add a goal).
const DUE_OPTIONS = ['Today', 'This week', 'This month', 'Custom']
const KINDS = [
  { id: 'linked', label: "Part of a goal I'm pursuing", desc: 'Attach it to a goal on your roadmap' },
  { id: 'new', label: 'The start of a new goal', desc: 'A bigger theme — e.g. “graduate school”' },
  { id: 'standalone', label: 'A standalone task', desc: 'Just this, on its own' },
]

let sid = 0
const newId = () => `sp${Date.now()}_${sid++}`

export default function Sprints({ profile, onUpdate }) {
  const sprints = profile.sprints || []
  const goals = profile.goals || []
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('This week')
  const [custom, setCustom] = useState('')
  const [kind, setKind] = useState('standalone')
  const [linkedGoalId, setLinkedGoalId] = useState(null)
  const [newGoalText, setNewGoalText] = useState('')

  // "Daily steps" generator — break a goal into small day-by-day sprints.
  const [genGoalId, setGenGoalId] = useState(null)
  const [genDays, setGenDays] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const ready =
    title.trim() &&
    (kind === 'standalone' || (kind === 'linked' && linkedGoalId) || (kind === 'new' && newGoalText.trim()))

  const reset = () => {
    setTitle('')
    setCustom('')
    setDue('This week')
    setKind('standalone')
    setLinkedGoalId(null)
    setNewGoalText('')
  }

  const add = () => {
    if (!ready) return
    const dueLabel = due === 'Custom' ? custom.trim() || 'Soon' : due
    const base = { id: newId(), title: title.trim(), due: dueLabel, completed: false, createdAt: new Date().toISOString() }
    let next = { ...profile }

    if (kind === 'linked') {
      const g = goals.find((x) => x.id === linkedGoalId)
      next = { ...next, sprints: [{ ...base, kind: 'linked', linkedGoalId, goalTitle: g?.title, goalCategory: g?.category }, ...sprints] }
    } else if (kind === 'new') {
      const goal = buildGoal(newGoalText.trim())
      next = {
        ...next,
        goals: [...goals, goal],
        sprints: [{ ...base, kind: 'new', linkedGoalId: goal.id, goalTitle: goal.title, goalCategory: goal.category }, ...sprints],
      }
    } else {
      next = { ...next, sprints: [{ ...base, kind: 'standalone' }, ...sprints] }
    }
    onUpdate(next)
    reset()
  }

  const toggle = (id) =>
    onUpdate({ ...profile, sprints: sprints.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)) })
  const remove = (id) => onUpdate({ ...profile, sprints: sprints.filter((s) => s.id !== id) })

  // Ask Coach to break the goal's current milestone into day-by-day steps, then
  // drop them in as linked sprints (Day 1, Day 2, …). Falls back to the
  // milestone's own stepping stones if the AI is unreachable, so it never dead-ends.
  const generateDaily = async () => {
    const g = goals.find((x) => x.id === genGoalId)
    if (!g || generating) return
    setGenerating(true)
    setGenError('')
    try {
      const found = (g.milestones || []).findIndex((m) => !m.completed)
      const idx = found === -1 ? 0 : found
      let actions
      try {
        actions = await dailyActionGenerator.generateDailyActionsForMilestone(g, idx, profile.coachTone || 'default')
      } catch (e) {
        // Local fallback: spread the current milestone's stepping stones over days.
        const stones = (g.milestones?.[idx]?.steps || []).map((s) => ({ title: s.title }))
        if (!stones.length) throw e
        actions = stones
      }
      const groupId = `daygrp_${Date.now()}`
      const picked = (actions || []).slice(0, genDays)
      if (!picked.length) throw new Error('No steps came back — try again.')
      const daySprints = picked.map((a, i) => ({
        id: `${groupId}_${i}`,
        title: a.title,
        due: `Day ${i + 1}`,
        completed: false,
        createdAt: new Date().toISOString(),
        kind: 'linked',
        linkedGoalId: g.id,
        goalTitle: g.title,
        goalCategory: g.category,
        day: i + 1,
        group: groupId,
      }))
      onUpdate({ ...profile, sprints: [...daySprints, ...sprints] })
      setGenGoalId(null)
    } catch (e) {
      setGenError(e?.message || 'Could not generate steps. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  const active = sprints.filter((s) => !s.completed)
  const done = sprints.filter((s) => s.completed)

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 130, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingTop: 56, paddingBottom: 16 }}>
          <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 3 }}>SHORT-TERM</Text>
          <Text style={{ fontFamily: F.display, fontSize: 30, color: C.ink, letterSpacing: 1.4, lineHeight: 38 }}>SPRINTS</Text>
          <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, marginTop: 6, lineHeight: 20 }}>
            A test on Friday, an essay due this week — capture it, say what it’s part of, and beat it.
          </Text>
        </View>

        {/* Add form */}
        <View style={{ marginHorizontal: 24, borderRadius: 18, padding: 18, backgroundColor: 'rgba(13,13,27,0.85)', borderWidth: 1, borderColor: C.lineMid }}>
          <Text style={{ fontFamily: F.display, fontSize: 10.5, color: C.violet, letterSpacing: 1.6, marginBottom: 12 }}>NEW SPRINT</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Ace my chemistry midterm"
            placeholderTextColor={C.faint2}
            autoComplete="off"
            style={inputStyle}
          />

          {/* Due */}
          <Text style={subLabel}>WHEN'S IT DUE?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DUE_OPTIONS.map((d) => (
              <Chip key={d} icon label={d} on={due === d} onPress={() => setDue(d)} />
            ))}
          </View>
          {due === 'Custom' && (
            <TextInput value={custom} onChangeText={setCustom} placeholder="When's it due? e.g. Fri 5pm" placeholderTextColor={C.faint2} autoComplete="off" style={[inputStyle, { marginTop: 10 }]} />
          )}

          {/* What is this? */}
          <Text style={subLabel}>WHAT IS THIS?</Text>
          <View style={{ gap: 8 }}>
            {KINDS.map((k) => {
              const on = kind === k.id
              return (
                <Pressable
                  key={k.id}
                  onPress={() => setKind(k.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: on ? 'rgba(245,158,11,0.1)' : C.violetFill07, borderWidth: 1, borderColor: on ? C.amber : C.lineMid }}
                >
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: on ? C.amber : C.faint3, alignItems: 'center', justifyContent: 'center' }}>
                    {on && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber }} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: on ? C.amber : C.ink }}>{k.label}</Text>
                    <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.dim, marginTop: 1 }}>{k.desc}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>

          {/* Goal picker for "linked" */}
          {kind === 'linked' && (
            <View style={{ marginTop: 12 }}>
              {goals.length === 0 ? (
                <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, fontStyle: 'italic' }}>No goals yet — pick another option.</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {goals.map((g) => {
                    const color = CATEGORY_COLORS[g.category] || C.amber
                    const on = linkedGoalId === g.id
                    return (
                      <Pressable key={g.id} onPress={() => setLinkedGoalId(g.id)} style={{ borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: on ? color + '22' : 'transparent', borderWidth: 1, borderColor: on ? color : C.lineStrong }}>
                        <Text style={{ fontFamily: on ? F.semibold : F.body, fontSize: 12, color: on ? color : C.dim }}>
                          {g.title.length > 24 ? g.title.slice(0, 24) + '…' : g.title}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </View>
          )}

          {/* New goal name for "new" */}
          {kind === 'new' && (
            <TextInput value={newGoalText} onChangeText={setNewGoalText} placeholder="What's the bigger goal? e.g. Get into grad school" placeholderTextColor={C.faint2} autoComplete="off" style={[inputStyle, { marginTop: 12 }]} />
          )}

          {/* Add */}
          <Pressable onPress={add} disabled={!ready} style={{ marginTop: 16 }}>
            {ready ? (
              <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13 }}>
                <Plus size={16} color={C.amberInk} strokeWidth={2.6} />
                <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.amberInk }}>{kind === 'new' ? 'Add sprint + new goal' : 'Add sprint'}</Text>
              </LinearGradient>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.line }}>
                <Plus size={16} color={C.faint2} strokeWidth={2.6} />
                <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.faint2 }}>Add sprint</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Daily-steps generator — break a goal into day-by-day sprints */}
        {goals.length > 0 && (
          <View style={{ marginHorizontal: 24, marginTop: 16, borderRadius: 18, padding: 18, backgroundColor: 'rgba(13,13,27,0.85)', borderWidth: 1, borderColor: C.lineMid }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <Sparkles size={13} color={C.violet} strokeWidth={2.2} />
              <Text style={{ fontFamily: F.display, fontSize: 10.5, color: C.violet, letterSpacing: 1.6 }}>DAILY STEPS</Text>
            </View>
            <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginBottom: 14, lineHeight: 18 }}>
              Let Coach break a goal into small, day-by-day steps — knock them out one at a time.
            </Text>

            <Text style={subLabel}>WHICH GOAL?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {goals.map((g) => {
                const color = CATEGORY_COLORS[g.category] || C.amber
                const on = genGoalId === g.id
                return (
                  <Pressable key={g.id} onPress={() => setGenGoalId(g.id)} style={{ borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: on ? color + '22' : 'transparent', borderWidth: 1, borderColor: on ? color : C.lineStrong }}>
                    <Text style={{ fontFamily: on ? F.semibold : F.body, fontSize: 12, color: on ? color : C.dim }}>
                      {g.title.length > 24 ? g.title.slice(0, 24) + '…' : g.title}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={subLabel}>HOW MANY DAYS?</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[3, 5, 7].map((n) => (
                <Chip key={n} label={`${n} days`} on={genDays === n} onPress={() => setGenDays(n)} />
              ))}
            </View>

            {genError ? (
              <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.amber, marginTop: 12 }}>{genError}</Text>
            ) : null}

            <Pressable onPress={generateDaily} disabled={!genGoalId || generating} style={{ marginTop: 16 }}>
              {genGoalId && !generating ? (
                <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13 }}>
                  <Sparkles size={16} color={C.amberInk} strokeWidth={2.6} />
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.amberInk }}>Generate {genDays} daily steps</Text>
                </LinearGradient>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.line }}>
                  {generating ? (
                    <>
                      <ActivityIndicator size="small" color={C.violet} />
                      <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.dim }}>Coach is planning your days…</Text>
                    </>
                  ) : (
                    <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.faint2 }}>Pick a goal first</Text>
                  )}
                </View>
              )}
            </Pressable>
          </View>
        )}

        {/* Active */}
        <View style={{ paddingHorizontal: 24, marginTop: 24, gap: 12 }}>
          <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 2.2 }}>IN PROGRESS · {active.length}</Text>
          {active.length === 0 && <Text style={{ fontFamily: F.body, fontSize: 13, color: C.faint, fontStyle: 'italic' }}>Nothing on deck. Add a sprint above.</Text>}
          {active.map((s) => (
            <SprintRow key={s.id} sprint={s} onToggle={() => toggle(s.id)} onRemove={() => remove(s.id)} />
          ))}
        </View>

        {/* Done */}
        {done.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 24, gap: 12 }}>
            <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 2.2 }}>DONE · {done.length}</Text>
            {done.map((s) => (
              <SprintRow key={s.id} sprint={s} onToggle={() => toggle(s.id)} onRemove={() => remove(s.id)} />
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function SprintRow({ sprint, onToggle, onRemove }) {
  const { completed } = sprint
  const goalColor = sprint.goalCategory ? CATEGORY_COLORS[sprint.goalCategory] || C.violet : C.violet
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: completed ? 'rgba(16,185,129,0.06)' : 'rgba(13,13,27,0.8)', borderWidth: 1, borderColor: completed ? 'rgba(16,185,129,0.25)' : C.line }}>
      <Pressable onPress={onToggle} hitSlop={8}>
        <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: completed ? C.green : C.faint3, backgroundColor: completed ? C.green : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {completed && <Check size={14} color={C.bg} strokeWidth={3} />}
        </View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.medium, fontSize: 14.5, color: completed ? C.faint : C.ink, textDecorationLine: completed ? 'line-through' : 'none' }}>
          {sprint.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <CalendarClock size={11} color={C.amber} strokeWidth={2} />
            <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.amber }}>{sprint.due}</Text>
          </View>
          {sprint.goalTitle && (
            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: goalColor + '1f', borderWidth: 1, borderColor: goalColor + '40' }}>
              <Text style={{ fontFamily: F.medium, fontSize: 10.5, color: goalColor }}>
                {sprint.kind === 'new' ? '✦ ' : ''}{sprint.goalTitle.length > 22 ? sprint.goalTitle.slice(0, 22) + '…' : sprint.goalTitle}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Pressable onPress={onRemove} hitSlop={8}>
        <X size={16} color={C.faint2} strokeWidth={2.2} />
      </Pressable>
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
