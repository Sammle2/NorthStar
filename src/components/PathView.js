import React, { useMemo, useRef, useState } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient as SvgGrad, Path, Stop } from 'react-native-svg'
import { goalPct, goalUnits, unitsDone } from '../logic'
import { Card, Kicker } from './Ui'
import { catColor } from '../theme'

const W = Math.min(Dimensions.get('window').width, 520)
const SEG_H = 170 // vertical distance between milestones
const PAD_TOP = 120
const PAD_BOTTOM = 110

// Build the winding road: square one at the bottom, the summit at the top.
function buildGeometry(milestoneCount) {
  const segments = milestoneCount + 1
  const height = PAD_TOP + PAD_BOTTOM + SEG_H * segments
  const points = [{ x: W / 2, y: height - PAD_BOTTOM }] // square one
  for (let i = 0; i < milestoneCount; i++) {
    points.push({ x: i % 2 === 0 ? W * 0.26 : W * 0.74, y: height - PAD_BOTTOM - SEG_H * (i + 1) })
  }
  points.push({ x: W / 2, y: PAD_TOP }) // the summit
  let d = `M ${points[0].x} ${points[0].y}`
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const my = (a.y + b.y) / 2
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`
    length += Math.hypot(b.x - a.x, b.y - a.y) * 1.12 // bezier ≈ straight × 1.12
  }
  return { points, d, height, length }
}

export default function PathView({ state, colors }) {
  const goals = state.dreams.flatMap((d) =>
    d.goals.filter((g) => g.accepted).map((g) => ({ ...g, dream: d })),
  )
  const [view, setView] = useState('dream') // 'dream' | goal id
  const [selected, setSelected] = useState(null) // tapped milestone payload
  const scrollRef = useRef(null)

  const goal = goals.find((g) => g.id === view)

  // Dream Path: cumulative progress across every accepted goal, no milestones.
  const dreamPct = useMemo(() => {
    const total = goals.reduce((s, g) => s + goalUnits(g), 0)
    const done = goals.reduce((s, g) => s + unitsDone(state, g.id), 0)
    return total ? Math.min(100, (done / total) * 100) : 0
  }, [state, goals])

  const milestones = goal ? goal.steps : []
  const pct = goal ? goalPct(state, goal) : dreamPct
  const geo = useMemo(() => buildGeometry(goal ? milestones.length : 2), [view, state.dreams])
  // dream path keeps its bends but hides the joint nodes
  const nodePoints = goal ? geo.points.slice(1, -1) : []

  const fillLen = (geo.length * pct) / 100

  function selectMilestone(step, idx) {
    const per = 100 / goalUnits(goal)
    const reps = Object.values(state.tasks)
      .flat()
      .filter((t) => t.stepId === step.id && t.completed).length
    setSelected({
      title: step.title,
      sub: step.routine ? 'Daily action — every rep moves the path' : 'One-time milestone',
      detail: `${reps} completed · each one is +${per.toFixed(1)}% toward "${goal.title}"`,
      lit: pct >= ((idx + 1) / (milestones.length + 1)) * 100,
    })
  }

  return (
    <View style={{ flex: 1 }}>
      {/* path switcher */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.switchRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 22 }}>
        <Chip
          label="✦ The Dream"
          on={view === 'dream'}
          colors={colors}
          onPress={() => {
            setView('dream')
            setSelected(null)
          }}
        />
        {goals.map((g) => (
          <Chip
            key={g.id}
            label={g.dream.category + ': ' + g.title.slice(0, 18) + (g.title.length > 18 ? '…' : '')}
            on={view === g.id}
            colors={colors}
            onPress={() => {
              setView(g.id)
              setSelected(null)
            }}
          />
        ))}
      </ScrollView>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <View style={{ width: W, alignSelf: 'center', height: geo.height }}>
          <Svg width={W} height={geo.height} style={StyleSheet.absoluteFill}>
            <Defs>
              {/* gold at the summit, purple at square one */}
              <SvgGrad id="roadFill" x1="0" y1={String(geo.height)} x2="0" y2="0" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#a78bfa" />
                <Stop offset="0.55" stopColor="#d8a874" />
                <Stop offset="1" stopColor="#f59e0b" />
              </SvgGrad>
            </Defs>
            {/* the unlit road */}
            <Path d={geo.d} stroke="rgba(150,140,255,0.16)" strokeWidth="5" fill="none" strokeLinecap="round" />
            {/* the glow halo of progress */}
            <Path
              d={geo.d}
              stroke="url(#roadFill)"
              strokeWidth="13"
              opacity="0.3"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${geo.length}`}
              strokeDashoffset={String(geo.length - fillLen)}
            />
            {/* the lit road — fills exactly to where you are */}
            <Path
              d={geo.d}
              stroke="url(#roadFill)"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${geo.length}`}
              strokeDashoffset={String(geo.length - fillLen)}
            />
          </Svg>

          {/* square one */}
          <View style={[styles.marker, { top: geo.height - PAD_BOTTOM - 14, left: W / 2 - 14 }]}>
            <View style={[styles.node, { borderColor: colors.violet, backgroundColor: colors.bg }]} />
            <Text style={[styles.markerLabel, { color: colors.inkDim, width: 130, marginLeft: -51 }]}>Square One</Text>
          </View>

          {/* milestones: the daily actions (goal paths only) */}
          {nodePoints.map((p, i) => {
            const step = milestones[i]
            const lit = pct >= ((i + 1) / (milestones.length + 1)) * 100
            return (
              <Pressable
                key={step.id}
                onPress={() => selectMilestone(step, i)}
                style={[styles.marker, { top: p.y - 14, left: p.x - 14 }]}
              >
                <View
                  style={[
                    styles.node,
                    lit
                      ? { backgroundColor: colors.gold, borderColor: colors.gold, shadowColor: colors.gold, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }
                      : { backgroundColor: colors.bg, borderColor: colors.lineStrong },
                  ]}
                />
                <Text
                  numberOfLines={2}
                  style={[
                    styles.markerLabel,
                    { color: lit ? colors.ink : colors.inkFaint, width: 132, marginLeft: -52, textAlign: 'center' },
                  ]}
                >
                  {step.title}
                </Text>
              </Pressable>
            )
          })}

          {/* the summit */}
          <Pressable
            onPress={() =>
              setSelected(
                goal
                  ? { title: goal.title, sub: 'The finish line', detail: `${pct.toFixed(0)}% of the road is lit`, lit: pct >= 100 }
                  : { title: 'The Dream', sub: 'Every path feeds this one', detail: `${dreamPct.toFixed(0)}% of the whole journey is lit`, lit: dreamPct >= 100 },
              )
            }
            style={[styles.marker, { top: PAD_TOP - 30, left: W / 2 - 22 }]}
          >
            <Text style={{ fontSize: 30, textShadowColor: colors.gold, textShadowRadius: pct >= 99 ? 18 : 6 }}>
              {pct >= 100 ? '🏆' : '✦'}
            </Text>
            <Text style={[styles.summitLabel, { color: colors.gold, width: 180, marginLeft: -68 }]} numberOfLines={2}>
              {goal ? goal.title : 'The Dream'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* milestone detail — % lives here, never on the path */}
      {selected && (
        <Card colors={colors} style={[styles.detail, { borderColor: selected.lit ? colors.gold : colors.lineStrong }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Kicker colors={colors}>{selected.sub}</Kicker>
              <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 15.5 }}>{selected.title}</Text>
              <Text style={{ color: colors.inkDim, fontSize: 13, marginTop: 6 }}>{selected.detail}</Text>
            </View>
            <Text onPress={() => setSelected(null)} style={{ color: colors.inkFaint, fontSize: 20, padding: 4 }}>
              ×
            </Text>
          </View>
        </Card>
      )}
    </View>
  )
}

function Chip({ label, on, colors, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: on ? colors.gold : colors.lineStrong, backgroundColor: on ? 'rgba(245,158,11,0.12)' : 'transparent' },
      ]}
    >
      <Text style={{ color: on ? colors.gold : colors.inkDim, fontSize: 12.5, fontWeight: on ? '800' : '500' }}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  switchRow: { flexGrow: 0, marginTop: 10, marginBottom: 4 },
  chip: { borderWidth: 1, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 14 },
  marker: { position: 'absolute', alignItems: 'center' },
  node: { width: 28, height: 28, borderRadius: 14, borderWidth: 2.5 },
  markerLabel: { fontSize: 11.5, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  summitLabel: { fontSize: 13.5, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  detail: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
})
