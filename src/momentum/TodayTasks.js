// ── Momentum roadmap: the Today tab ──────────────────────────────────────────
// A single FLAT, schedule-aware checklist of every task due today across ALL of
// the user's Dreams' current stones — cadence-driven, so a Mon/Wed/Fri task only
// shows on those days. Each row is a single tap (the entire momentum input), tags
// back to its source Dream/lever, and its tag deep-links into that stone's
// roadmap view. This is a doing surface: no goal-hierarchy navigation to get here.
//
// Rendered as a plain section INSIDE the existing Today (Dashboard) ScrollView, so
// it adds to that tab without restructuring it.
import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { CheckCircle2, Circle } from 'lucide-react-native'
import { C, F } from '../app/tokens'
import { CATEGORY_COLORS, normalizeCategory } from '../app/mockData'
import { collectTodayTasks } from './store'
import { toggleTaskDone } from './store'
import StoneDetail from './StoneDetail'

export default function TodayTasks({ profile, onUpdate, showHeader = true }) {
  const [openGoalId, setOpenGoalId] = useState(null)
  const rows = collectTodayTasks(profile)

  if (!rows.length) return null // nothing due today across any Dream — stay quiet

  const done = rows.filter((r) => r.done).length
  const openGoal = openGoalId ? (profile.goals || []).find((g) => g.id === openGoalId) : null

  return (
    <View style={{ paddingHorizontal: 24, marginTop: showHeader ? 26 : 6 }}>
      {showHeader && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontFamily: F.display, fontSize: 12, color: C.faint, letterSpacing: 2.2 }}>TODAY'S MOMENTUM</Text>
          <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: done === rows.length ? C.green : C.violet }}>{done}/{rows.length}</Text>
        </View>
      )}

      <View style={{ gap: 10 }}>
        {rows.map((r) => {
          const color = CATEGORY_COLORS[normalizeCategory(r.category)] || C.violet
          const tagLabel = r.lever ? `${shorten(r.goalTitle)} · ${r.lever.title}` : shorten(r.goalTitle)
          return (
            <View
              key={`${r.stoneId}:${r.task.id}`}
              style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: r.done ? 'rgba(16,185,129,0.07)' : 'rgba(13,13,27,0.8)', borderWidth: 1, borderColor: r.done ? 'rgba(16,185,129,0.28)' : C.line }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
                <Pressable onPress={() => toggleTaskDone(onUpdate, r.goalId, r.stoneId, r.task.id)} hitSlop={6}>
                  {r.done ? <CheckCircle2 size={23} color={C.green} strokeWidth={2.2} /> : <Circle size={23} color={C.faint3} strokeWidth={2} />}
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => toggleTaskDone(onUpdate, r.goalId, r.stoneId, r.task.id)}>
                  <Text style={{ fontFamily: F.medium, fontSize: 14.5, color: r.done ? C.faint : C.ink2, textDecorationLine: r.done ? 'line-through' : 'none' }}>{r.task.title}</Text>
                </Pressable>
                {/* Source tag → deep-links into that stone's roadmap view */}
                <Pressable onPress={() => setOpenGoalId(r.goalId)} hitSlop={6} style={{ maxWidth: 128, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: color + '1E', borderWidth: 1, borderColor: color + '4D' }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.semibold, fontSize: 10.5, color }}>{tagLabel}</Text>
                </Pressable>
              </View>
            </View>
          )
        })}
      </View>

      {openGoal && <StoneDetail goal={openGoal} onUpdate={onUpdate} onClose={() => setOpenGoalId(null)} />}
    </View>
  )
}

function shorten(title, n = 16) {
  const t = String(title || '').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
