// ── Momentum roadmap: the celestial stone road ───────────────────────────────
// The goal's road, in Max's celestial language — the same winding path and
// violet→gold lit gradient — but the markers are STONES (measurable outcome
// checkpoints), not 3/6/12-month milestones. Square One at the bottom, the
// summit at the top, and the road lights up as far as you've actually come.
//
// Stones are DELIBERATELY not tappable: a stone is earned by moving the real
// number, so you log it in the Progress entry below and the road advances
// itself. Nothing here can be "checked off" by hand.
import React, { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import Svg, { Defs, LinearGradient as SvgGrad, Path, Stop } from 'react-native-svg'
import { Check, Lock } from 'lucide-react-native'
import { C, F } from '../app/tokens'
import GlowProgress from '../app/components/GlowProgress'
import { getR2, orderedStones, currentStone } from './model'
import { outcomeProgress, paceEta, dreamProgressPct, stoneMomentum, pct as toPct } from './engine'
import { logOutcome, markStoneComplete } from './store'
import { momentumColor } from './GoalMomentumBar'

const SEG_H = 150
const PAD_TOP = 120
const PAD_BOTTOM = 100

// Same winding geometry Max's road uses, so the stone road reads as the same map.
function buildGeometry(nodeCount, W) {
  const segments = nodeCount + 1
  const height = PAD_TOP + PAD_BOTTOM + SEG_H * segments
  const points = [{ x: W / 2, y: height - PAD_BOTTOM }] // Square One
  for (let i = 0; i < nodeCount; i++) {
    points.push({ x: i % 2 === 0 ? W * 0.27 : W * 0.73, y: height - PAD_BOTTOM - SEG_H * (i + 1) })
  }
  points.push({ x: W / 2, y: PAD_TOP }) // summit
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const my = (a.y + b.y) / 2
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`
  }
  return { points, d, height }
}

function targetLine(stone) {
  if (!stone || stone.targetValue == null) return stone?.targetMetric || ''
  const arrow = stone.direction === 'down' ? '↓' : '↑'
  return `${stone.targetMetric || 'target'} ${arrow} ${stone.targetValue}${stone.targetUnit ? ' ' + stone.targetUnit : ''}`
}

export default function StoneRoad({ goal, onUpdate }) {
  const [containerW, setContainerW] = useState(0)
  const scrollRef = useRef(null)
  const r2 = getR2(goal)
  const stones = orderedStones(r2)
  const cur = currentStone(r2)
  const W = Math.min(containerW || 360, 520)
  const geo = buildGeometry(stones.length, W)
  const pctLit = dreamProgressPct(goal)

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      {/* Progress entry — the ONLY way a stone gets earned. */}
      <ProgressEntry goal={goal} stone={cur} onUpdate={onUpdate} />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <View style={{ width: W, alignSelf: 'center', height: geo.height }}>
          <Svg width={W} height={geo.height} style={{ position: 'absolute', left: 0, top: 0 }}>
            <Defs>
              <SvgGrad id="stoneRoadFill" x1="0" y1={String(geo.height)} x2="0" y2="0" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#a78bfa" />
                <Stop offset="0.55" stopColor="#d8a874" />
                <Stop offset="1" stopColor="#f59e0b" />
              </SvgGrad>
            </Defs>
            {/* the road */}
            <Path d={geo.d} stroke="rgba(167,139,250,0.30)" strokeWidth="3" fill="none" strokeLinecap="round" />
            {/* how far you've actually come — driven by real progress, not taps */}
            <Path
              d={geo.d}
              stroke="url(#stoneRoadFill)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="100 100"
              strokeDashoffset={100 - Math.max(0, Math.min(100, pctLit))}
            />
          </Svg>

          {/* Square One */}
          <View style={{ position: 'absolute', top: geo.points[0].y - 12, left: W / 2 - 75, width: 150, alignItems: 'center' }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.violet, backgroundColor: C.bg }} />
            <Text style={{ marginTop: 6, fontFamily: F.medium, fontSize: 11, color: C.dim }}>Square One</Text>
          </View>

          {/* The stones — display only */}
          {stones.map((s, i) => {
            const p = geo.points[i + 1]
            const done = s.status === 'complete'
            const isCur = cur && s.id === cur.id
            const locked = s.status === 'locked'
            const accent = done ? C.green : isCur ? C.amber : C.faint2
            return (
              <View
                key={s.id}
                pointerEvents="none"
                style={{ position: 'absolute', top: p.y - 20, left: p.x - 82, width: 164, alignItems: 'center', opacity: locked ? 0.5 : 1 }}
              >
                <View
                  style={[
                    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
                    done
                      ? { backgroundColor: accent, borderColor: accent, shadowColor: accent, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }
                      : isCur
                        ? { backgroundColor: C.bg, borderColor: accent, shadowColor: accent, shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }
                        : { backgroundColor: C.bg, borderColor: C.lineStrong },
                  ]}
                >
                  {done ? (
                    <Check size={17} color={C.amberInk} strokeWidth={3} />
                  ) : locked ? (
                    <Lock size={13} color={C.faint} />
                  ) : (
                    <Text style={{ fontFamily: F.bold, fontSize: 13, color: accent }}>{i + 1}</Text>
                  )}
                </View>
                {isCur && (
                  <Text style={{ fontFamily: F.bold, fontSize: 8.5, color: accent, letterSpacing: 1.5, marginTop: 5 }}>YOU ARE HERE</Text>
                )}
                <Text numberOfLines={2} style={{ marginTop: isCur ? 2 : 6, textAlign: 'center', fontFamily: F.semibold, fontSize: 12.5, lineHeight: 16, color: done ? C.ink : isCur ? C.ink : C.faint }}>
                  {s.title}
                </Text>
                <Text style={{ marginTop: 1, fontFamily: F.body, fontSize: 10.5, color: C.faint }}>{targetLine(s)}</Text>
              </View>
            )
          })}

          {/* Summit */}
          <View pointerEvents="none" style={{ position: 'absolute', top: PAD_TOP - 44, left: W / 2 - 110, width: 220, alignItems: 'center' }}>
            <Text style={{ fontSize: 28 }}>{pctLit >= 100 ? '🏆' : '✦'}</Text>
            <Text numberOfLines={2} style={{ marginTop: 4, textAlign: 'center', fontFamily: F.display, fontSize: 14, color: C.amber, letterSpacing: 0.5 }}>{goal.title}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

// ── the progress entry ───────────────────────────────────────────────────────
// Logging the real number is what advances the road. When a stone has no numeric
// target there's nothing to measure, so it falls back to a single "reached it".
function ProgressEntry({ goal, stone, onUpdate }) {
  const [val, setVal] = useState('')
  const [note, setNote] = useState(null)
  if (!stone) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.green, textAlign: 'center' }}>Every stone reached 🏆</Text>
      </View>
    )
  }
  const op = outcomeProgress(stone)
  const eta = paceEta(stone)
  const r2 = getR2(goal)
  const m = stoneMomentum(r2, stone)

  const save = () => {
    const v = parseFloat(val)
    if (isNaN(v)) return
    const res = logOutcome(onUpdate, goal.id, stone.id, v)
    setVal('')
    if (res && res.completed) setNote(res.dreamDone ? 'Dream complete 🎉' : 'Stone reached — the next one just unlocked')
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 }}>
      <View style={{ borderRadius: 14, padding: 14, backgroundColor: C.violetFill07, borderWidth: 1, borderColor: C.lineMid }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.dim, letterSpacing: 1, textTransform: 'uppercase' }}>Progress</Text>
          <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.violet }}>{op.hasTarget ? op.text : stone.title}</Text>
        </View>
        {op.pct != null && <View style={{ marginTop: 8 }}><GlowProgress value={Math.round(op.pct * 100)} color={C.violet} height={6} /></View>}
        {eta && <Text style={{ fontFamily: F.body, fontSize: 10.5, color: C.faint, marginTop: 7 }}>{eta.text} · a projection, not a deadline</Text>}

        {op.hasTarget ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <TextInput
              value={val}
              onChangeText={(t) => setVal(t.replace(/[^0-9.\-]/g, ''))}
              placeholder={`Log ${stone.targetMetric || 'progress'}${stone.targetUnit ? ` (${stone.targetUnit})` : ''}`}
              placeholderTextColor={C.faint}
              keyboardType="numeric"
              style={{ flex: 1, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.lineMid, paddingHorizontal: 11, paddingVertical: 9, color: C.ink, fontFamily: F.medium, fontSize: 13 }}
            />
            <Pressable onPress={save} style={{ borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: C.violet }}>
              <Text style={{ fontFamily: F.bold, fontSize: 12.5, color: C.amberInk }}>Log</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => { const r = markStoneComplete(onUpdate, goal.id, stone.id); if (r && r.completed) setNote(r.dreamDone ? 'Dream complete 🎉' : 'Stone reached') }}
            style={{ marginTop: 10, borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: C.green + '22', borderWidth: 1, borderColor: C.green + '55' }}
          >
            <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.green }}>Mark this stone reached</Text>
          </Pressable>
        )}

        {note && <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.green, marginTop: 9 }}>{note}</Text>}
        {m != null && (
          <Text style={{ fontFamily: F.body, fontSize: 10.5, color: C.faint, marginTop: 9 }}>
            Momentum {toPct(m)}% · your daily habits. The road moves on the number above.
          </Text>
        )}
      </View>
    </View>
  )
}
