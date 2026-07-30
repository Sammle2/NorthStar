// ── Momentum roadmap: compact per-goal momentum readout ──────────────────────
// A small bar + score + current-stone marker for ONE goal. Always visible: at 0%
// the bar sits empty and fills to its true % as daily tasks get done. Coloured on
// the SAME violet→gold scheme as Max's road (the lit path runs #a78bfa → #f59e0b),
// so a low momentum reads violet and a strong one reads gold.
import React from 'react'
import { Text, View } from 'react-native'
import { C, F } from '../app/tokens'
import GlowProgress from '../app/components/GlowProgress'
import { getR2, orderedStones, currentStone } from './model'
import { stoneMomentum, pct } from './engine'

// Interpolate violet (#a78bfa) → gold (#f59e0b) by momentum fraction (0..1),
// matching the roadmap's lit-path gradient. null/0 → violet, 1 → gold.
export function momentumColor(score) {
  const t = score == null ? 0 : Math.max(0, Math.min(1, score))
  const a = [167, 139, 250] // #a78bfa violet
  const b = [245, 158, 11] //  #f59e0b gold
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

export default function GoalMomentumBar({ goal, width = '100%' }) {
  const r2 = getR2(goal)
  const stones = orderedStones(r2)
  const cur = currentStone(r2)
  const curIdx = cur ? stones.findIndex((s) => s.id === cur.id) : -1
  const m = cur ? stoneMomentum(r2, cur) : null
  // Always a number so the bar is always present — 0% until tasks get done.
  const mPct = pct(m) == null ? 0 : pct(m)
  const color = momentumColor(m == null ? 0 : m)
  const label = cur
    ? `MOMENTUM · CHECKPOINT ${curIdx + 1}/${stones.length}`
    : stones.length
      ? 'MOMENTUM · ALL CHECKPOINTS DONE'
      : 'MOMENTUM'

  return (
    <View style={{ marginTop: 6, width }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontFamily: F.medium, fontSize: 9, color: C.faint, letterSpacing: 0.6 }}>{label}</Text>
        <Text style={{ fontFamily: F.bold, fontSize: 10.5, color }}>{mPct}%</Text>
      </View>
      <GlowProgress value={mPct} color={color} height={4} />
    </View>
  )
}
