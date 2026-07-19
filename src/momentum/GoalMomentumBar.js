// ── Momentum roadmap: compact per-goal momentum readout ──────────────────────
// A small bar + score + current-stone marker for ONE goal, shown under each goal
// in Max's Roadmap category sub-view so "in each category you see your goals,
// each with a momentum feature." Renders nothing for goals that haven't adopted
// the momentum mechanism yet, so it never disturbs a plain goal's look.
import React from 'react'
import { Text, View } from 'react-native'
import { C, F } from '../app/tokens'
import GlowProgress from '../app/components/GlowProgress'
import { getR2, hasR2, orderedStones, currentStone } from './model'
import { stoneMomentum, pct } from './engine'

export function momentumColor(score) {
  if (score == null) return C.faint
  if (score >= 0.75) return C.green
  if (score >= 0.4) return C.amber
  return C.red
}

export default function GoalMomentumBar({ goal, width = '100%' }) {
  if (!hasR2(goal)) return null
  const r2 = getR2(goal)
  const stones = orderedStones(r2)
  const cur = currentStone(r2)
  const curIdx = cur ? stones.findIndex((s) => s.id === cur.id) : -1
  const m = cur ? stoneMomentum(r2, cur) : null
  const mPct = pct(m)
  const color = momentumColor(m)

  return (
    <View style={{ marginTop: 6, width }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontFamily: F.medium, fontSize: 9, color: C.faint, letterSpacing: 0.6 }}>
          {cur ? `MOMENTUM · STONE ${curIdx + 1}/${stones.length}` : 'ALL STONES DONE'}
        </Text>
        <Text style={{ fontFamily: F.bold, fontSize: 10.5, color }}>{mPct == null ? '—' : `${mPct}%`}</Text>
      </View>
      <GlowProgress value={mPct || 0} color={color} height={4} />
    </View>
  )
}
