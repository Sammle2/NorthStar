import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { AlertTriangle, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import { CATEGORY_COLORS } from '../mockData'
import { recomputeGoal, regenerateMilestones } from '../aiEngine'
import { validateGoalAgainstDream } from '../../services/roadmapValidation'

// The ONLY place the roadmap is editable. Redo the whole goal: edit its three
// timed milestones (3 / 6 / 12 months) and the stepping stones under each — or
// let the Coach generate them for you — then mark how far you've already come.
// On save, the Coach sanity-checks your edits against your dream and warns you
// if they may not get you there — but you always have the final say.
let sidc = 0
const ns = () => `s${Date.now()}_${sidc++}`

export default function GoalEditor({ goal, onSave, onCancel, dream }) {
  const color = CATEGORY_COLORS[goal.category] || C.amber
  const [title, setTitle] = useState(goal.title)
  const [milestones, setMilestones] = useState(goal.milestones.map((m) => ({ ...m, steps: (m.steps || []).map((s) => ({ ...s })) })))
  const initialUpTo = (() => {
    let last = -1
    goal.milestones.forEach((m, i) => {
      if (m.completed) last = i
    })
    return last
  })()
  const [upTo, setUpTo] = useState(initialUpTo)
  const [checking, setChecking] = useState(false)
  const [warning, setWarning] = useState(null) // { text, goal } when validation flags the plan

  const editMsTitle = (mi, text) => setMilestones((ms) => ms.map((m, i) => (i === mi ? { ...m, title: text } : m)))
  const editStep = (mi, si, text) =>
    setMilestones((ms) => ms.map((m, i) => (i === mi ? { ...m, steps: m.steps.map((s, j) => (j === si ? { ...s, title: text } : s)) } : m)))
  const addStep = (mi) => setMilestones((ms) => ms.map((m, i) => (i === mi ? { ...m, steps: [...m.steps, { id: ns(), title: '', completed: false }] } : m)))
  const removeStep = (mi, si) => setMilestones((ms) => ms.map((m, i) => (i === mi ? { ...m, steps: m.steps.filter((_, j) => j !== si) } : m)))
  const regenerate = () => {
    setMilestones(regenerateMilestones(title).map((m) => ({ ...m, steps: m.steps.map((s) => ({ ...s })) })))
    setUpTo(-1)
  }

  const buildGoal = () => {
    const ms = milestones.map((m, i) => {
      const reached = i <= upTo
      const steps = (m.steps || [])
        .filter((s) => s.title.trim())
        .map((s) => ({ ...s, title: s.title.trim(), completed: reached ? true : s.completed }))
      return { ...m, title: m.title.trim() || m.title, steps }
    })
    return recomputeGoal({ ...goal, title: title.trim() || goal.title, milestones: ms })
  }

  const save = async () => {
    const next = buildGoal()
    setChecking(true)
    try {
      const { aligned, warning: w } = await validateGoalAgainstDream({ dream, goal: next })
      if (aligned || !w) {
        onSave(next)
      } else {
        // The Coach has a concern — surface it, but let the user decide.
        setWarning({ text: w, goal: next })
      }
    } catch {
      // Never let a validation hiccup block the user's save.
      onSave(next)
    } finally {
      setChecking(false)
    }
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 200 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, letterSpacing: 1.2 }}>REDO GOAL</Text>
            <Pressable onPress={onCancel} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineMid }}>
              <X size={18} color={C.dim} strokeWidth={2.2} />
            </Pressable>
          </View>
          <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.faint, marginBottom: 20, lineHeight: 19 }}>
            Edit your milestones and stepping stones — or let the Coach draft them — then mark how far you’ve come.
          </Text>

          {/* Goal title */}
          <Text style={sectionLabel}>GOAL</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Your goal" placeholderTextColor={C.faint2} autoComplete="off" style={inputStyle} />

          {/* Regenerate */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 4 }}>
            <Text style={[sectionLabel, { marginBottom: 0 }]}>MILESTONES & STEPPING STONES</Text>
            <Pressable onPress={regenerate} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}>
              <Sparkles size={12} color={C.violet} strokeWidth={2.2} />
              <Text style={{ fontFamily: F.semibold, fontSize: 11.5, color: C.violet }}>Draft for me</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint, marginBottom: 12 }}>
            Don’t know your milestones? Tap “Draft for me” and tweak from there.
          </Text>

          {milestones.map((m, mi) => (
            <View key={m.id} style={{ borderRadius: 16, borderWidth: 1, borderColor: color + '33', backgroundColor: 'rgba(13,13,27,0.6)', padding: 14, marginBottom: 14 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 10.5, color, letterSpacing: 1.5, marginBottom: 8 }}>{m.horizon.toUpperCase()}</Text>
              <TextInput value={m.title} onChangeText={(t) => editMsTitle(mi, t)} placeholder={`${m.horizon} milestone`} placeholderTextColor={C.faint2} autoComplete="off" multiline style={[inputStyle, { fontFamily: F.semibold, marginBottom: 12 }]} />
              <Text style={{ fontFamily: F.display, fontSize: 9.5, color: C.faint, letterSpacing: 1.5, marginBottom: 8 }}>STEPPING STONES</Text>
              <View style={{ gap: 6 }}>
                {m.steps.map((s, si) => (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingLeft: 12, paddingRight: 6, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.line }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                    <TextInput value={s.title} onChangeText={(t) => editStep(mi, si, t)} placeholder={`Stepping stone ${si + 1}`} placeholderTextColor={C.faint2} autoComplete="off" style={{ flex: 1, fontFamily: F.body, fontSize: 13, color: C.ink, paddingVertical: 9 }} />
                    <Pressable onPress={() => removeStep(mi, si)} hitSlop={6} style={{ padding: 4 }}>
                      <Trash2 size={14} color={C.faint2} strokeWidth={2} />
                    </Pressable>
                  </View>
                ))}
              </View>
              <Pressable onPress={() => addStep(mi)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, alignSelf: 'flex-start', paddingVertical: 4 }}>
                <Plus size={13} color={color} strokeWidth={2.6} />
                <Text style={{ fontFamily: F.medium, fontSize: 12.5, color }}>Add stepping stone</Text>
              </Pressable>
            </View>
          ))}

          {/* Where are you now */}
          <Text style={[sectionLabel, { marginTop: 12 }]}>WHERE ARE YOU NOW?</Text>
          <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginBottom: 12 }}>Tap the last milestone you’ve already reached.</Text>
          <Pressable onPress={() => setUpTo(-1)} style={{ borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 8, backgroundColor: upTo === -1 ? 'rgba(245,158,11,0.1)' : 'transparent', borderWidth: 1, borderColor: upTo === -1 ? C.amber : C.lineStrong }}>
            <Text style={{ fontFamily: F.medium, fontSize: 13, color: upTo === -1 ? C.amber : C.dim }}>Haven’t started yet</Text>
          </Pressable>
          <View style={{ gap: 8 }}>
            {milestones.map((m, i) => {
              const reached = i <= upTo
              return (
                <Pressable key={m.id} onPress={() => setUpTo(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: reached ? color + '14' : 'transparent', borderWidth: 1, borderColor: reached ? color : C.lineStrong }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: reached ? color : C.faint3, backgroundColor: reached ? color : 'transparent' }} />
                  <Text style={{ flex: 1, fontFamily: F.body, fontSize: 13, color: reached ? C.ink : C.dim }}>
                    <Text style={{ fontFamily: F.bold, color }}>{m.horizon} · </Text>
                    {m.title}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Save */}
          <Pressable onPress={save} disabled={checking} style={{ marginTop: 24 }}>
            <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {checking && <ActivityIndicator size="small" color={C.amberInk} />}
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>{checking ? 'Checking with your Coach…' : 'Save roadmap'}</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Coach concern — the user always has the final say */}
      {warning && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,7,15,0.82)', alignItems: 'center', justifyContent: 'center', padding: 28, zIndex: 300 }}>
          <View style={{ width: '100%', maxWidth: 420, borderRadius: 20, padding: 22, backgroundColor: C.card, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,158,11,0.14)' }}>
                <AlertTriangle size={17} color={C.amber} strokeWidth={2.2} />
              </View>
              <Text style={{ fontFamily: F.display, fontSize: 14, color: C.ink, letterSpacing: 1 }}>A QUICK GUT-CHECK</Text>
            </View>
            <Text style={{ fontFamily: F.body, fontSize: 14, color: C.ink2, lineHeight: 21, marginBottom: 6 }}>{warning.text}</Text>
            <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.faint, lineHeight: 19, marginBottom: 20 }}>
              It’s your call — you know your life better than anyone.
            </Text>
            <Pressable onPress={() => { const g = warning.goal; setWarning(null); onSave(g) }}>
              <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.amberInk }}>Save it anyway</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setWarning(null)} style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.dim }}>Keep editing</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}

const sectionLabel = { fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 10 }
const inputStyle = {
  backgroundColor: C.lineSoft,
  borderWidth: 1,
  borderColor: C.lineStrong,
  borderRadius: 12,
  paddingVertical: 13,
  paddingHorizontal: 16,
  fontFamily: F.body,
  fontSize: 15,
  color: C.ink,
}
