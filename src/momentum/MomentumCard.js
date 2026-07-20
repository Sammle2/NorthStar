// ── Momentum roadmap: the Roadmap-tab entry point ────────────────────────────
// A compact card dropped into Max's Roadmap header (one line in his JSX). It
// shows the current stone + lever-weighted momentum for the viewed Dream and
// opens the full StoneDetail sheet — so his celestial-map layout is untouched
// and everything momentum lives behind this single affordance.
import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronRight, Sparkles, TrendingUp } from 'lucide-react-native'
import { C, F } from '../app/tokens'
import GlowProgress from '../app/components/GlowProgress'
import { getR2, hasR2, orderedStones, currentStone } from './model'
import { stoneMomentum, pct } from './engine'
import { momentumColor } from './GoalMomentumBar'
import StoneDetail from './StoneDetail'

export default function MomentumCard({ goal, onUpdate, situation = '', accent = C.amber }) {
  const [open, setOpen] = useState(false)
  const has = hasR2(goal)
  const r2 = getR2(goal)
  const stones = has ? orderedStones(r2) : []
  const cur = has ? currentStone(r2) : null
  const curIdx = cur ? stones.findIndex((s) => s.id === cur.id) : -1
  const m = has && cur ? stoneMomentum(r2, cur) : null
  const mPct = pct(m)
  const color = momentumColor(m == null ? 0 : m)

  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 2 }}>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({ borderRadius: 14, padding: 14, backgroundColor: pressed ? C.violetFill : 'rgba(13,13,27,0.7)', borderWidth: 1, borderColor: pressed ? C.violet : C.line })}
      >
        {has ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TrendingUp size={16} color={color} strokeWidth={2.2} />
              <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 11.5, color: C.dim, letterSpacing: 1 }}>
                {cur ? `STONE ${curIdx + 1} OF ${stones.length}` : 'ALL STONES COMPLETE'}
              </Text>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color }}>{mPct == null ? '—' : `${mPct}%`}</Text>
              <ChevronRight size={16} color={C.faint} />
            </View>
            {cur && <Text numberOfLines={1} style={{ fontFamily: F.semibold, fontSize: 13.5, color: C.ink, marginTop: 6 }}>{cur.title}</Text>}
            <View style={{ marginTop: 8 }}><GlowProgress value={mPct || 0} color={color} height={5} /></View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(245,158,11,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} color={accent} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: C.ink }}>Add momentum to this Dream</Text>
              <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.dim, marginTop: 1 }}>Stones, tasks & a real target — no deadlines</Text>
            </View>
            <ChevronRight size={16} color={C.faint} />
          </View>
        )}
      </Pressable>

      {open && <StoneDetail goal={goal} onUpdate={onUpdate} situation={situation} onClose={() => setOpen(false)} />}
    </View>
  )
}
