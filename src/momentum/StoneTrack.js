// ── Momentum roadmap: the stone track (seeing progress) ──────────────────────
// The read/act surface for ONE Dream's mechanism, shown inside Max's Roadmap
// (via MomentumCard's overlay) and from a Today-tab task tag. It keeps momentum
// and outcome as two SEPARATE readouts — never merged into one number:
//   • Momentum %  — lever-weighted, tap to expand into per-lever bars + checklist
//   • Outcome     — the real metric vs the stone's target, on its own cadence
// A stone completes only when its OUTCOME target is met.
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Check, ChevronDown, ChevronUp, Circle, CheckCircle2, Lock, Plus, Sparkles, TrendingUp } from 'lucide-react-native'
import { C, F } from '../app/tokens'
import GlowProgress from '../app/components/GlowProgress'
import {
  getR2, hasR2, orderedStones, currentStone, todayKey,
  tasksDueOn, isTaskDoneOn,
} from './model'
import { stoneMomentum, leverMomenta, outcomeProgress, paceEta, pct, shouldNudgeAdjust } from './engine'
import { toggleTaskDone, logOutcome, markStoneComplete, addTask } from './store'
import { generateStoneTasks } from './generate'
import { CATEGORIES, normalizeCategory } from '../app/mockData'
import StoneBuilder from './StoneBuilder'
import { momentumColor } from './GoalMomentumBar'

export default function StoneTrack({ goal, onUpdate, situation = '' }) {
  const [showBuilder, setShowBuilder] = useState(false)

  if (!hasR2(goal)) {
    return (
      <View style={{ padding: 4 }}>
        <View style={{ borderRadius: 16, padding: 20, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.line, alignItems: 'center' }}>
          <TrendingUp size={26} color={C.violet} strokeWidth={2} />
          <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.ink, marginTop: 12, textAlign: 'center' }}>Give this Dream real momentum</Text>
          <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
            Break it into measurable stones and daily tasks. Progress by hitting real numbers — no deadlines.
          </Text>
          <Pressable onPress={() => setShowBuilder(true)} style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: C.amber }}>
            <Sparkles size={15} color={C.amberInk} strokeWidth={2.4} />
            <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: C.amberInk }}>Lay the stones</Text>
          </Pressable>
        </View>
        {showBuilder && <StoneBuilder goal={goal} onUpdate={onUpdate} situation={situation} onClose={() => setShowBuilder(false)} />}
      </View>
    )
  }

  const r2 = getR2(goal)
  const stones = orderedStones(r2)
  const cur = currentStone(r2)

  return (
    <View style={{ padding: 4 }}>
      {/* Stone sequence */}
      <View style={{ gap: 8 }}>
        {stones.map((s, i) => (
          <StoneRow key={s.id} stone={s} index={i} isCurrent={cur && s.id === cur.id} r2={r2} goal={goal} onUpdate={onUpdate} />
        ))}
      </View>
      {showBuilder && <StoneBuilder goal={goal} onUpdate={onUpdate} situation={situation} onClose={() => setShowBuilder(false)} />}
    </View>
  )
}

function StoneRow({ stone, index, isCurrent, r2, goal, onUpdate }) {
  const done = stone.status === 'complete'
  const locked = stone.status === 'locked'
  const accent = done ? C.green : isCurrent ? C.amber : C.faint2

  return (
    <View style={{ borderRadius: 16, padding: 16, backgroundColor: isCurrent ? 'rgba(245,158,11,0.06)' : C.card, borderWidth: 1, borderColor: isCurrent ? 'rgba(245,158,11,0.3)' : C.line, opacity: locked ? 0.55 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: accent + '22', borderWidth: 1, borderColor: accent + '55' }}>
          {done ? <Check size={15} color={C.green} strokeWidth={2.6} /> : locked ? <Lock size={13} color={C.faint} /> : <Text style={{ fontFamily: F.bold, fontSize: 12, color: accent }}>{index + 1}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: done ? C.dim : C.ink }}>{stone.title || `Stone ${index + 1}`}</Text>
          <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint, marginTop: 2 }}>{targetLine(stone)}</Text>
        </View>
        <StatusPill status={stone.status} />
      </View>

      {isCurrent && <CurrentStoneBody stone={stone} r2={r2} goal={goal} onUpdate={onUpdate} />}
    </View>
  )
}

function CurrentStoneBody({ stone, r2, goal, onUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const [outVal, setOutVal] = useState('')
  const [celebrate, setCelebrate] = useState(null)
  const [genBusy, setGenBusy] = useState(false)

  const m = stoneMomentum(r2, stone)
  const mPct = pct(m)
  const levers = leverMomenta(r2, stone)
  const op = outcomeProgress(stone)
  const eta = paceEta(stone)
  const nudge = shouldNudgeAdjust(r2, stone)
  const today = todayKey()
  const dueToday = tasksDueOn(stone, today)

  const saveOutcome = () => {
    const v = parseFloat(outVal)
    if (isNaN(v)) return
    const res = logOutcome(onUpdate, goal.id, stone.id, v)
    setOutVal('')
    if (res && res.completed) setCelebrate(res.dreamDone ? 'Dream complete 🎉' : 'Stone complete — next one unlocked!')
  }

  const generate = async () => {
    setGenBusy(true)
    const catBlurb = (CATEGORIES.find((c) => c.key === normalizeCategory(goal.category)) || {}).blurb || ''
    const drafted = await generateStoneTasks({ dreamTitle: goal.title, category: goal.category, categoryBlurb: catBlurb, stone, levers: r2.levers, experience: r2.experience || '' })
    for (const t of drafted) addTask(onUpdate, goal.id, stone.id, { title: t.title, type: t.type, cadenceDays: t.cadenceDays, leverId: leverIdByTitle(r2, t.lever) })
    setGenBusy(false)
  }

  return (
    <View style={{ marginTop: 14, gap: 14 }}>
      {/* Momentum — its own readout, expandable to lever bars */}
      <View>
        <Pressable onPress={() => setExpanded((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.medium, fontSize: 11.5, color: C.dim, letterSpacing: 1, textTransform: 'uppercase' }}>Momentum</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: momentumColor(m) }}>{mPct == null ? '—' : `${mPct}%`}</Text>
            {r2.levers.length > 0 && (expanded ? <ChevronUp size={15} color={C.faint} /> : <ChevronDown size={15} color={C.faint} />)}
          </View>
        </Pressable>
        <View style={{ marginTop: 8 }}><GlowProgress value={mPct || 0} color={momentumColor(m)} height={7} /></View>

        {expanded && r2.levers.length > 0 && (
          <View style={{ marginTop: 12, gap: 10 }}>
            {levers.map((l) => (
              <View key={l.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.ink3 }}>{l.title} · {Math.round((l.weight || 0) * 100)}%</Text>
                  <Text style={{ fontFamily: F.semibold, fontSize: 12, color: momentumColor(l.score) }}>{l.score == null ? '—' : `${pct(l.score)}%`}</Text>
                </View>
                <GlowProgress value={pct(l.score) || 0} color={momentumColor(l.score)} height={5} />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Progress (the real-world metric) — a SEPARATE readout, never merged with momentum */}
      {op.hasTarget && (
        <View style={{ borderRadius: 12, padding: 12, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineSoft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: F.medium, fontSize: 11.5, color: C.dim, letterSpacing: 1, textTransform: 'uppercase' }}>Progress</Text>
            <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.violet }}>{op.text}</Text>
          </View>
          {op.pct != null && <View style={{ marginTop: 8 }}><GlowProgress value={Math.round(op.pct * 100)} color={C.violet} height={6} /></View>}
          {eta && <Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint, marginTop: 8 }}>{eta.text} · a projection, not a deadline</Text>}
          {/* Check-in */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <TextInput
              value={outVal}
              onChangeText={(t) => setOutVal(t.replace(/[^0-9.\-]/g, ''))}
              placeholder={`Log ${stone.targetMetric || 'metric'}${stone.targetUnit ? ` (${stone.targetUnit})` : ''}`}
              placeholderTextColor={C.faint}
              keyboardType="numeric"
              style={{ flex: 1, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.lineMid, paddingHorizontal: 11, paddingVertical: 9, color: C.ink, fontFamily: F.medium, fontSize: 13 }}
            />
            <Pressable onPress={saveOutcome} style={{ borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.violet }}>
              <Text style={{ fontFamily: F.bold, fontSize: 12.5, color: C.amberInk }}>Log</Text>
            </Pressable>
          </View>
          {nudge && (
            <Text style={{ fontFamily: F.body, fontSize: 12, color: C.amber, marginTop: 10, lineHeight: 17 }}>
              Your consistency's been solid — the number just hasn't moved yet. Want to adjust your tasks or this target? Plateaus are normal.
            </Text>
          )}
          {celebrate && <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.green, marginTop: 10 }}>{celebrate}</Text>}
        </View>
      )}
      {!op.hasTarget && (
        <Pressable onPress={() => { const r = markStoneComplete(onUpdate, goal.id, stone.id); if (r && r.completed) setCelebrate(r.dreamDone ? 'Dream complete 🎉' : 'Stone complete!') }} style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: C.green + '22', borderWidth: 1, borderColor: C.green + '55' }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.green }}>{celebrate || 'Mark this stone reached'}</Text>
        </Pressable>
      )}

      {/* Today's tasks for this stone (single tap) */}
      <View>
        <Text style={{ fontFamily: F.medium, fontSize: 11.5, color: C.dim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Today's tasks</Text>
        {dueToday.length === 0 && stone.tasks.length === 0 && (
          <Pressable onPress={generate} disabled={genBusy} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10, paddingVertical: 11, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid, borderStyle: 'dashed' }}>
            {genBusy ? <ActivityIndicator color={C.violet} /> : <><Plus size={14} color={C.violet} /><Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.violet }}>Draft this stone's tasks</Text></>}
          </Pressable>
        )}
        {dueToday.length === 0 && stone.tasks.length > 0 && (
          <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint }}>Nothing scheduled today — enjoy the rest.</Text>
        )}
        <View style={{ gap: 8 }}>
          {dueToday.map((t) => {
            const isDone = isTaskDoneOn(stone, t.id, today)
            const lever = (r2.levers || []).find((l) => l.id === t.leverId)
            return (
              <Pressable key={t.id} onPress={() => toggleTaskDone(onUpdate, goal.id, stone.id, t.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: isDone ? 'rgba(16,185,129,0.08)' : C.card, borderWidth: 1, borderColor: isDone ? 'rgba(16,185,129,0.3)' : C.line }}>
                {isDone ? <CheckCircle2 size={20} color={C.green} strokeWidth={2.2} /> : <Circle size={20} color={C.faint3} strokeWidth={2} />}
                <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 13.5, color: isDone ? C.faint : C.ink2, textDecorationLine: isDone ? 'line-through' : 'none' }}>{t.title}</Text>
                {lever && <Tag label={lever.title} />}
              </Pressable>
            )
          })}
        </View>
      </View>
    </View>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────
function leverIdByTitle(r2, title) {
  if (!title) return null
  const l = (r2.levers || []).find((x) => x.title.toLowerCase() === String(title).toLowerCase())
  return l ? l.id : null
}

function targetLine(stone) {
  if (stone.targetValue == null) return stone.targetMetric || 'Checkpoint'
  const arrow = stone.direction === 'down' ? '↓' : '↑'
  return `${stone.targetMetric || 'target'} ${arrow} ${stone.targetValue}${stone.targetUnit ? ' ' + stone.targetUnit : ''}`
}

// momentumColor (violet→gold) is imported from GoalMomentumBar so every momentum
// surface shares the roadmap's colour scheme.

function StatusPill({ status }) {
  const map = {
    complete: { label: 'Done', color: C.green },
    current: { label: 'Now', color: C.amber },
    locked: { label: 'Locked', color: C.faint },
  }
  const s = map[status] || map.locked
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: s.color + '1E', borderWidth: 1, borderColor: s.color + '4D' }}>
      <Text style={{ fontFamily: F.semibold, fontSize: 9.5, color: s.color, letterSpacing: 0.5, textTransform: 'uppercase' }}>{s.label}</Text>
    </View>
  )
}

export function Tag({ label, color = C.violet }) {
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: color + '1E', borderWidth: 1, borderColor: color + '45' }}>
      <Text style={{ fontFamily: F.semibold, fontSize: 10, color, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  )
}
