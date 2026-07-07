import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Defs, LinearGradient as SvgGrad, Path, Stop } from 'react-native-svg'
import { RotateCcw } from 'lucide-react-native'
import { C, F } from '../tokens'
import { CATEGORY_COLORS } from '../mockData'
import { recomputeGoal, shortStepLabel } from '../aiEngine'
import StarField from '../components/StarField'

// "The Path" — the winding road. Square One at the bottom, the summit at the top.
// Climbing up: each goal's three timed milestones (3 / 6 / 12 months), and the
// little stepping stones leading to each one. Stepping stones are your day-to-day
// wins — tap to complete them; a milestone lights up once all its stones are done.
// Editing the milestones themselves happens only in Redo (GoalEditor).
const SEG_H = 150
const PAD_TOP = 130
const PAD_BOTTOM = 110

function buildGeometry(nodeCount, W) {
  const segments = nodeCount + 1
  const height = PAD_TOP + PAD_BOTTOM + SEG_H * segments
  const points = [{ x: W / 2, y: height - PAD_BOTTOM }]
  for (let i = 0; i < nodeCount; i++) {
    points.push({ x: i % 2 === 0 ? W * 0.27 : W * 0.73, y: height - PAD_BOTTOM - SEG_H * (i + 1) })
  }
  points.push({ x: W / 2, y: PAD_TOP })
  let d = `M ${points[0].x} ${points[0].y}`
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const my = (a.y + b.y) / 2
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`
    length += Math.hypot(b.x - a.x, b.y - a.y) * 1.12
  }
  return { points, d, height, length }
}

export default function Roadmap({ profile, onUpdate, onRedoGoal }) {
  // Size the road to the ACTUAL container, not the window: on web the app lives in
  // a fixed 375px phone frame while the window is much wider — useWindowDimensions
  // alone would build a 520px road that overflows the frame and clips edge labels.
  const win = useWindowDimensions()
  const [containerW, setContainerW] = useState(0)
  const W = Math.min(containerW || win.width || 520, 520)

  const goals = profile.goals
  const [view, setView] = useState('dream')
  const [selected, setSelected] = useState(null)
  // Which stepping stone's detail dropdown is open (key: `${milestoneId}:${stepId}`).
  const [expandedStep, setExpandedStep] = useState(null)
  const scrollRef = useRef(null)

  // Scroll position drives the parallax starfield (stars drift slower than the road).
  const scrollY = useRef(new Animated.Value(0)).current
  // A slow pulse for the "you are here" glow on the current milestone.
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    ).start()
  }, [])

  const goal = goals.find((g) => g.id === view)
  // If the viewed goal disappears (e.g. NOVA removed it via chat), fall back to
  // the Dream view instead of leaving the switcher pointing at a dead id.
  useEffect(() => {
    if (view !== 'dream' && !goal) {
      setView('dream')
      setSelected(null)
    }
  }, [view, goal])
  const dreamPct = useMemo(
    () => (goals.length ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0),
    [profile],
  )
  const accent = goal ? CATEGORY_COLORS[goal.category] || C.amber : C.amber

  // Flatten the goal into ordered path nodes: stepping stones then milestone, ×3.
  const nodes = useMemo(() => {
    if (!goal) return []
    const out = []
    goal.milestones.forEach((m) => {
      ;(m.steps || []).forEach((s) => out.push({ type: 'step', milestone: m, step: s }))
      out.push({ type: 'milestone', milestone: m })
    })
    return out
  }, [goal, profile])

  const pct = goal ? goal.progress : dreamPct
  const geo = useMemo(() => buildGeometry(goal ? nodes.length : 2, W), [view, nodes.length, W])
  const nodePoints = goal ? geo.points.slice(1, -1) : []

  // The current milestone — the first one you haven't reached yet — gets the glow.
  const currentMsId = goal ? (goal.milestones.find((m) => !m.completed) || {}).id : null

  // Sequential progression: stepping stones must be completed in order, across the
  // whole goal. The "frontier" is the first stone you haven't done yet — you can
  // complete that one (or uncheck the last one you did); everything ahead is locked
  // so you can't click past the milestone you're on.
  const flatSteps = useMemo(() => {
    const arr = []
    ;(goal?.milestones || []).forEach((m) => (m.steps || []).forEach((s) => arr.push({ key: `${m.id}:${s.id}`, done: !!s.completed })))
    return arr
  }, [goal, profile])
  const frontier = useMemo(() => {
    const i = flatSteps.findIndex((s) => !s.done)
    return i === -1 ? flatSteps.length : i
  }, [flatSteps])
  // 'done' = completed & locked, 'last' = last completed (can undo), 'current' =
  // next one to do, 'locked' = ahead of the frontier (not yet reachable).
  const stepStatusOf = (mId, sId) => {
    const idx = flatSteps.findIndex((s) => s.key === `${mId}:${sId}`)
    if (idx < 0) return 'locked'
    if (idx === frontier) return 'current'
    if (idx === frontier - 1) return 'last'
    if (idx < frontier) return 'done'
    return 'locked'
  }

  const toggleStep = (milestoneId, stepId) => {
    if (!goal) return
    // Only the active edge is interactive — the next stone to do, or the last one
    // done (to undo). Anything else is locked, enforcing one-before-the-other.
    const status = stepStatusOf(milestoneId, stepId)
    if (status !== 'current' && status !== 'last') return
    const updatedGoal = recomputeGoal({
      ...goal,
      milestones: goal.milestones.map((m) =>
        m.id !== milestoneId ? m : { ...m, steps: m.steps.map((s) => (s.id === stepId ? { ...s, completed: !s.completed } : s)) },
      ),
    })
    onUpdate({ ...profile, goals: goals.map((g) => (g.id === goal.id ? updatedGoal : g)) })
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 56, paddingBottom: 6 }}>
        <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 3 }}>YOUR PATH TO</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ flex: 1, fontFamily: F.display, fontSize: 26, color: C.ink, letterSpacing: 1.2, lineHeight: 34 }}>
            {goal ? goal.title.toUpperCase() : 'THE DREAM'}
          </Text>
          {goal && onRedoGoal && (
            <Pressable onPress={() => onRedoGoal(goal)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}>
              <RotateCcw size={13} color={C.violet} strokeWidth={2.2} />
              <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.violet }}>Redo</Text>
            </Pressable>
          )}
        </View>
        {goal && (
          <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint, marginTop: 4 }}>
            Tap a stepping stone as you complete it. Edit milestones with Redo.
          </Text>
        )}
      </View>

      {/* Path switcher — wraps onto multiple rows so every goal chip is visible
          (horizontal scroll was easy to miss, especially on web). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 24, marginTop: 6, marginBottom: 4 }}>
        <Chip label="✦ The Dream" on={view === 'dream'} color={C.amber} onPress={() => { setView('dream'); setSelected(null); setExpandedStep(null) }} />
        {goals.map((g) => {
          const c = CATEGORY_COLORS[g.category] || C.amber
          return (
            <Chip key={g.id} label={g.title} on={view === g.id} color={c} onPress={() => { setView(g.id); setSelected(null); setExpandedStep(null) }} />
          )
        })}
      </View>

      <View style={{ flex: 1 }}>
        {/* Parallax starfield — drifts up slower than the road as you scroll, giving depth. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -60,
            left: 0,
            right: 0,
            bottom: -220,
            transform: [
              {
                translateY: scrollY.interpolate({
                  inputRange: [0, Math.max(1, geo.height)],
                  outputRange: [0, -150],
                  extrapolate: 'clamp',
                }),
              },
            ],
          }}
        >
          <StarField count={70} seed={goal ? 21 : 7} maxTop={100} />
        </Animated.View>

        <Animated.ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
        <View style={{ width: W, alignSelf: 'center', height: geo.height }}>
          <Svg width={W} height={geo.height} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGrad id="roadFill" x1="0" y1={String(geo.height)} x2="0" y2="0" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#a78bfa" />
                <Stop offset="0.55" stopColor="#d8a874" />
                <Stop offset="1" stopColor="#f59e0b" />
              </SvgGrad>
            </Defs>

            {/* The path — a single winding line you follow up toward your dream. */}
            <Path d={geo.d} stroke="rgba(167,139,250,0.30)" strokeWidth="3" fill="none" strokeLinecap="round" />
            {/* The lit portion — how far you've come, revealed along the path from Square One. */}
            {pct > 0 ? (
              <Path
                d={geo.d}
                stroke="url(#roadFill)"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={`${pct} 100`}
              />
            ) : null}
          </Svg>

          {/* Square one */}
          <View style={[styles.marker, { top: geo.height - PAD_BOTTOM - 14, left: W / 2 - 75, width: 150 }]}>
            <View style={[styles.stepNode, { borderColor: C.violet, backgroundColor: C.bg }]} />
            <Text style={[styles.stepLabel, { color: C.dim }]}>Square One</Text>
          </View>

          {/* Stepping stones + milestone checkpoints */}
          {goal &&
            nodePoints.map((p, i) => {
              const node = nodes[i]
              if (node.type === 'step') {
                const lit = node.step.completed
                const status = stepStatusOf(node.milestone.id, node.step.id)
                const locked = status === 'locked'
                const current = status === 'current'
                const stepKey = `${node.milestone.id}:${node.step.id}`
                const expanded = expandedStep === stepKey
                // Path shows the compact 2-3 word name; the full detail lives in
                // the tap-to-expand dropdown. Legacy steps derive a label locally.
                const label = node.step.label || shortStepLabel(node.step.title)
                // Dropdown card: wider than the marker, clamped inside the screen.
                const cardW = 240
                const cardLeft = Math.max(8, Math.min(p.x - cardW / 2, W - cardW - 8)) - (p.x - 75)
                return (
                  <View
                    key={stepKey}
                    style={[styles.marker, { top: p.y - 11, left: p.x - 75, width: 150, zIndex: expanded ? 40 : 1 }, locked && !expanded && { opacity: 0.4 }]}
                  >
                    {/* The stone itself still toggles completion */}
                    <Pressable
                      onPress={locked ? undefined : () => toggleStep(node.milestone.id, node.step.id)}
                      disabled={locked}
                      hitSlop={8}
                      style={[
                        styles.stepNode,
                        lit
                          ? { backgroundColor: accent, borderColor: accent, shadowColor: accent, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }
                          : current
                            ? { backgroundColor: C.bg, borderColor: accent, shadowColor: accent, shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }
                            : { backgroundColor: C.bg, borderColor: C.lineStrong },
                      ]}
                    />
                    {/* The label opens/closes the detail dropdown */}
                    <Pressable onPress={() => setExpandedStep(expanded ? null : stepKey)} hitSlop={6} style={{ width: '100%', alignItems: 'center' }}>
                      <Text style={[styles.stepLabel, { color: lit ? C.ink2 : current ? accent : C.faint }]}>
                        {locked ? '🔒 ' : ''}{label} <Text style={{ fontSize: 9, color: C.faint2 }}>{expanded ? '▲' : '▼'}</Text>
                      </Text>
                    </Pressable>
                    {expanded && (
                      <Pressable
                        onPress={() => setExpandedStep(null)}
                        style={{
                          position: 'absolute', top: 46, left: cardLeft, width: cardW,
                          backgroundColor: C.card, borderWidth: 1.5, borderColor: lit || current ? accent : C.lineStrong,
                          borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                          shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 5 },
                        }}
                      >
                        <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.ink2, lineHeight: 18 }}>{node.step.title}</Text>
                        <Text style={{ fontFamily: F.medium, fontSize: 10.5, color: C.faint, marginTop: 8 }}>
                          {lit ? '✓ Completed' : current ? 'Up next — tap the stone to complete it' : locked ? 'Locked — finish the earlier stones first' : 'Tap the stone to undo'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )
              }
              // milestone checkpoint
              const m = node.milestone
              const lit = m.completed
              const isCurrent = m.id === currentMsId
              const doneSteps = (m.steps || []).filter((s) => s.completed).length
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setSelected({ horizon: m.horizon, title: m.title, detail: `${doneSteps}/${(m.steps || []).length} stepping stones complete`, lit, accent, current: isCurrent })}
                  style={[styles.marker, { top: p.y - 19, left: p.x - 85, width: 170 }]}
                >
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    {/* "You are here" pulsing glow on the current milestone */}
                    {isCurrent && (
                      <Animated.View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          width: 62,
                          height: 62,
                          top: -12,
                          left: -12,
                          borderRadius: 31,
                          backgroundColor: accent,
                          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.42] }),
                          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.45] }) }],
                        }}
                      />
                    )}
                    <View
                      style={[
                        styles.msNode,
                        lit
                          ? { backgroundColor: accent, borderColor: accent, shadowColor: accent, shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }
                          : { backgroundColor: C.card, borderColor: accent },
                        isCurrent && !lit ? { shadowColor: accent, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } } : null,
                      ]}
                    >
                      <Text style={{ fontFamily: F.bold, fontSize: 11, color: lit ? C.amberInk : accent }}>{m.horizon.split(' ')[0]}</Text>
                    </View>
                  </View>
                  {isCurrent && <Text style={{ fontFamily: F.bold, fontSize: 8.5, color: accent, letterSpacing: 1.5, marginTop: 5, width: '100%', textAlign: 'center' }}>YOU ARE HERE</Text>}
                  <Text style={[styles.msKicker, { color: accent, marginTop: isCurrent ? 2 : 7 }]}>{m.horizon.toUpperCase()}</Text>
                  <Text style={[styles.msLabel, { color: lit ? C.ink : C.ink2 }]}>{m.title}</Text>
                </Pressable>
              )
            })}

          {/* Summit */}
          <Pressable
            onPress={() =>
              setSelected(
                goal
                  ? { horizon: 'The summit', title: goal.title, detail: `${pct}% of the path is lit`, lit: pct >= 100, accent }
                  : { horizon: 'The dream', title: 'The Dream', detail: `${dreamPct}% of the whole journey is lit`, lit: dreamPct >= 100, accent: C.amber },
              )
            }
            style={[styles.marker, { top: PAD_TOP - 34, left: W / 2 - 110, width: 220 }]}
          >
            <Text style={{ fontSize: 30 }}>{pct >= 100 ? '🏆' : '✦'}</Text>
            <Text style={[styles.summitLabel, { color: C.amber }]}>{goal ? goal.title : 'The Dream'}</Text>
          </Pressable>
        </View>
        </Animated.ScrollView>
      </View>

      {/* Detail card */}
      {selected && (
        <View style={[styles.detail, { backgroundColor: C.card, borderColor: selected.lit ? selected.accent : C.lineStrong }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.display, fontSize: 10.5, color: selected.lit ? selected.accent : C.faint, letterSpacing: 2, marginBottom: 4 }}>{selected.horizon.toUpperCase()}</Text>
              <Text style={{ fontFamily: F.semibold, color: C.ink, fontSize: 15.5, lineHeight: 21 }}>{selected.title}</Text>
              <Text style={{ fontFamily: F.body, color: C.dim, fontSize: 13, marginTop: 6, lineHeight: 19 }}>{selected.detail}</Text>
            </View>
            <Pressable onPress={() => setSelected(null)}>
              <Text style={{ color: C.faint, fontSize: 20, paddingHorizontal: 4 }}>×</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}

function Chip({ label, on, color, onPress }) {
  // Chips show the FULL goal title — no character slicing. Long titles shrink to
  // the row and wrap onto a second line rather than getting cut off.
  return (
    <Pressable onPress={onPress} style={{ flexShrink: 1, maxWidth: '100%', borderWidth: 1, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 14, borderColor: on ? color : C.lineStrong, backgroundColor: on ? color + '1f' : 'transparent' }}>
      <Text style={{ fontFamily: on ? F.bold : F.medium, color: on ? color : C.dim, fontSize: 12.5, textAlign: 'center', lineHeight: 17 }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Markers are FIXED-WIDTH containers centered on their node (left: x - width/2),
  // so labels are truly centered and can never spill past the screen edge. Labels
  // fill the container ('100%') and wrap without clamping — full text, always.
  marker: { position: 'absolute', alignItems: 'center' },
  stepNode: { width: 22, height: 22, borderRadius: 11, borderWidth: 2.5 },
  msNode: { width: 38, height: 38, borderRadius: 19, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 11, fontFamily: F.medium, marginTop: 6, textAlign: 'center', lineHeight: 15, width: '100%' },
  msKicker: { fontSize: 9, fontFamily: F.bold, letterSpacing: 1.5, marginTop: 7, width: '100%', textAlign: 'center' },
  msLabel: { fontSize: 13, fontFamily: F.bold, marginTop: 2, textAlign: 'center', lineHeight: 17, width: '100%' },
  summitLabel: { fontSize: 14, fontFamily: F.bold, marginTop: 6, textAlign: 'center', lineHeight: 19, width: '100%' },
  detail: {
    position: 'absolute',
    bottom: 96,
    left: 16,
    right: 16,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
})
