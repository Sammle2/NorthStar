import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Path, Stop } from 'react-native-svg'
import { ChevronRight, RotateCcw } from 'lucide-react-native'
import { C, F } from '../tokens'
import { CATEGORY_COLORS } from '../mockData'
import { recomputeGoal, shortStepLabel } from '../aiEngine'
import StarField from '../components/StarField'

// The lit road + the timeline fill both animate their length, so an SVG Path that
// takes an Animated strokeDashoffset.
const AnimatedPath = Animated.createAnimatedComponent(Path)

// "The Path" — the winding road. Square One at the bottom, the summit at the top.
// Climbing up: each goal's three timed milestones (3 / 6 / 12 months), and the
// little stepping stones leading to each one. Stepping stones are your day-to-day
// wins — tap to complete them; a milestone lights up once all its stones are done.
// Editing the milestones themselves happens only in Redo (GoalEditor).
// Up top, a timeline switcher: each goal sits at its timeframeMonths along a
// Day 0 → horizon axis, with the Dream star at the far end.
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
  // Drives the lit portion of the road (0–100). It GLIDES to a new value when a
  // stepping stone is completed, but SNAPS when you switch to a different path.
  const roadAnim = useRef(new Animated.Value(0)).current
  const prevViewRef = useRef(view)
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
  useEffect(() => {
    if (prevViewRef.current !== view) {
      prevViewRef.current = view
      roadAnim.setValue(pct) // different path — jump, don't glide across goals
    } else {
      Animated.timing(roadAnim, { toValue: pct, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
    }
  }, [pct, view])
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
  // The single next action on THIS path — the first incomplete stepping stone,
  // in order (same frontier the road enforces). Drives the "Next up" line.
  const nextAction = useMemo(() => {
    if (!goal) return null
    for (const m of goal.milestones || []) {
      for (const s of m.steps || []) {
        if (!s.completed) return { milestone: m, step: s }
      }
    }
    return null
  }, [goal, profile])
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
          <Text numberOfLines={2} style={{ flex: 1, fontFamily: F.display, fontSize: 20, color: C.ink, letterSpacing: 0.8, lineHeight: 26 }}>
            {goal ? goal.title.toUpperCase() : 'THE DREAM'}
          </Text>
          {goal && onRedoGoal && (
            <Pressable onPress={() => onRedoGoal(goal)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}>
              <RotateCcw size={13} color={C.violet} strokeWidth={2.2} />
              <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.violet }}>Redo</Text>
            </Pressable>
          )}
        </View>
        {/* NEXT UP — the one action to take next on THIS path, pinned under the
            header so the immediate move is always visible without scanning the
            whole road. One line, ellipsized; tap to see it in the detail card.
            Occupies the same slot the old generic hint did — no extra rows. */}
        {goal && pct < 100 && nextAction && (
          <Pressable
            onPress={() => setSelected({ horizon: `Next up · ${nextAction.milestone.horizon}`, title: nextAction.step.title, detail: 'Your next step on this path — tap its glowing stone on the road to complete it.', lit: false, accent, current: true })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: accent + '14', borderWidth: 1, borderColor: accent + '40' }}
          >
            <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 9, color: accent, letterSpacing: 1.2, flexShrink: 0 }}>NEXT UP</Text>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.medium, fontSize: 12, color: C.ink2 }}>{nextAction.step.title || nextAction.step.label}</Text>
            <ChevronRight size={13} color={accent} strokeWidth={2.4} />
          </Pressable>
        )}
        {/* Goal complete → Nova asks what's next (the input lives in Redo → Draft for me). */}
        {goal && pct >= 100 && onRedoGoal && (
          <Pressable onPress={() => onRedoGoal(goal)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)' }}>
            <Text style={{ flex: 1, fontFamily: F.body, fontSize: 12.5, color: C.amber, lineHeight: 18 }}>
              🎉 You’ve reached this goal! Tell Nova your next priority and it’ll draft what’s next.
            </Text>
            <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.amberInk, backgroundColor: C.amber, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' }}>Redo</Text>
          </Pressable>
        )}
      </View>

      {/* Path switcher — a timeline from Day 0 to the horizon: tap a goal's node
          (or the Dream star at the far end) to switch which path is shown below. */}
      <TimelineSwitcher goals={goals} view={view} onSelect={(id) => { setView(id); setSelected(null); setExpandedStep(null) }} />

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
            {/* The lit portion — how far you've come, revealed along the path from
                Square One. strokeDashoffset animates so it GLIDES forward as you
                complete a stepping stone rather than jumping. */}
            <AnimatedPath
              d={geo.d}
              stroke="url(#roadFill)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="100 100"
              strokeDashoffset={roadAnim.interpolate({ inputRange: [0, 100], outputRange: [100, 0] })}
            />
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

// A tiny progress ring — a faint track with a coloured arc filled to `pct`,
// starting at 12 o'clock. Shows how far a goal is toward the finish.
function ProgressRing({ pct = 0, color, size = 14 }) {
  const sw = 2
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct))
  const cxy = size / 2
  return (
    <Svg width={size} height={size}>
      <Circle cx={cxy} cy={cxy} r={r} stroke={C.lineStrong} strokeWidth={sw} fill="none" />
      {p > 0 && (
        <Circle
          cx={cxy} cy={cxy} r={r} stroke={color} strokeWidth={sw} fill="none"
          strokeDasharray={`${(p / 100) * c} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cxy} ${cxy})`}
        />
      )}
    </Svg>
  )
}

// Timeline switcher — one progress bar per goal. Each goal's ring sits where the
// goal actually is on the way to the Dream: pct% of the distance along its bar
// toward the star (0% = the start, 100% = at the star). The ring slides right as
// the goal's progress climbs. Rows stay separated (one per goal). Tapping a row
// selects it: onSelect(g.id | 'dream').
const TL_ROW_TOP = 28
const TL_ROW_H = 22
const TL_RING = 14
const clampN = (v, lo, hi) => Math.max(lo, Math.min(v, hi))

function TimelineSwitcher({ goals, view, onSelect }) {
  // Measure the row itself (same trick as the road below) — on web the app lives
  // in a fixed 375px frame, so the window width can't be trusted.
  const [w, setW] = useState(0)
  // Furthest-along first. Ring position = live progress, so it moves as pct updates.
  const rows = goals
    .map((g) => ({ id: g.id, title: g.title, color: CATEGORY_COLORS[g.category] || C.amber, pct: clampN(Math.round(g.progress || 0), 0, 100) }))
    .sort((a, b) => b.pct - a.pct)
  const H = TL_ROW_TOP + Math.max(1, rows.length) * TL_ROW_H + 6
  const dreamX = w > 0 ? w - 12 : 0          // the star (the finish) at the far right
  const titleW = clampN(w * 0.34, 92, w * 0.44)
  const pctW = 26
  const barStart = titleW + 6 + pctW + 8     // bars begin after the title + % columns
  const barEnd = dreamX - 12                 // …and end just shy of the star

  // One Animated.Value per goal holding its live pct — when a stepping stone is
  // completed the pct changes and the fill + ring GLIDE to the new spot.
  const animRef = useRef({}).current
  rows.forEach((r) => { if (!animRef[r.id]) animRef[r.id] = new Animated.Value(r.pct) })
  const pctKey = rows.map((r) => `${r.id}:${r.pct}`).join('|')
  useEffect(() => {
    rows.forEach((r) => {
      Animated.timing(animRef[r.id], { toValue: r.pct, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pctKey])

  return (
    <View style={{ height: H, marginHorizontal: 24, marginTop: 6, marginBottom: 4 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <>
          {/* The finish line every bar runs toward, with the Dream star on top */}
          <View pointerEvents="none" style={{ position: 'absolute', left: dreamX, top: TL_ROW_TOP - 3, width: 1, height: rows.length * TL_ROW_H + 2, backgroundColor: C.lineMid }} />
          <Pressable onPress={() => onSelect('dream')} hitSlop={6} style={{ position: 'absolute', left: dreamX - 13, top: 0, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1.5, borderColor: view === 'dream' ? C.amber : C.lineStrong }}>
            <Text style={{ fontSize: 13, color: C.amber, opacity: view === 'dream' ? 1 : 0.65 }}>✦</Text>
          </Pressable>
          {/* One progress bar per goal */}
          {rows.map((r, i) => {
            const on = view === r.id
            const cy = TL_ROW_TOP + i * TL_ROW_H + TL_RING / 2
            const anim = animRef[r.id]
            const fillW = anim.interpolate({ inputRange: [0, 100], outputRange: [0, Math.max(0, barEnd - barStart)], extrapolate: 'clamp' })
            const ringL = anim.interpolate({ inputRange: [0, 100], outputRange: [barStart - TL_RING / 2, barEnd - TL_RING / 2], extrapolate: 'clamp' })
            return (
              <React.Fragment key={r.id}>
                {/* title */}
                <Pressable onPress={() => onSelect(r.id)} hitSlop={4} style={{ position: 'absolute', left: 0, top: cy - 8, width: titleW }}>
                  <Text numberOfLines={1} style={{ fontFamily: on ? F.semibold : F.medium, fontSize: 11, lineHeight: 15, color: on ? r.color : C.dim }}>{r.title}</Text>
                </Pressable>
                {/* % */}
                <Text style={{ position: 'absolute', left: titleW + 6, top: cy - 7, width: pctW, textAlign: 'right', fontFamily: F.semibold, fontSize: 10, color: on ? r.color : C.faint }}>{r.pct}%</Text>
                {/* track + animated fill (distance travelled) */}
                <View pointerEvents="none" style={{ position: 'absolute', left: barStart, top: cy - 1.5, width: barEnd - barStart, height: 3, borderRadius: 2, backgroundColor: C.lineStrong }} />
                <Animated.View pointerEvents="none" style={{ position: 'absolute', left: barStart, top: cy - 1.5, width: fillW, height: 3, borderRadius: 2, backgroundColor: r.color, opacity: on ? 1 : 0.75 }} />
                {/* the ring — glides to pct% of the way to the star */}
                <Animated.View style={{ position: 'absolute', left: ringL, top: cy - TL_RING / 2 }}>
                  <Pressable onPress={() => onSelect(r.id)} hitSlop={8}>
                    <ProgressRing pct={r.pct} color={r.color} size={TL_RING} />
                  </Pressable>
                </Animated.View>
              </React.Fragment>
            )
          })}
        </>
      )}
    </View>
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
