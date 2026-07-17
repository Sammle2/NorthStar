import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgGrad, Path, RadialGradient, Stop } from 'react-native-svg'
import { ChevronRight, RotateCcw, Zap } from 'lucide-react-native'
import { C, F } from '../tokens'
import { CATEGORY_COLORS } from '../mockData'
import { recomputeGoal, shortStepLabel } from '../aiEngine'
import StarField from '../components/StarField'
import { GoldStar } from '../components/StarMark'

// The lit road + the celestial map's goal-lines animate their length, so an SVG
// Path that takes an Animated strokeDashoffset.
const AnimatedPath = Animated.createAnimatedComponent(Path)

// The Roadmap has two faces:
//  · THE DREAM (overview) — a celestial map: every goal is a planet with a line
//    running up to the North Star (the dream). Each line lights up to the goal's
//    progress; tap a planet to walk that goal's path.
//  · A GOAL's path — the winding road. Square One at the bottom, the summit at
//    the top; timed milestones (3 / 6 / 12 months) and the stepping stones
//    leading to each one. Tap a stone to complete it; a milestone lights up once
//    all its stones are done. Editing milestones happens only in Redo (GoalEditor).
//    A slim constellation strip up top hops between paths and back to the Dream.
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

// Compact days-until label for a sprint's due date, for the small road pins:
// "today", "1d", "5d", or "late" once it's past. By calendar day, recomputed
// each render so it stays live.
function sprintDueLabel(iso) {
  if (!iso) return ''
  const due = new Date(iso)
  if (isNaN(due)) return ''
  const a = new Date(); a.setHours(0, 0, 0, 0)
  const b = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const d = Math.round((b - a) / 86400000)
  if (d < 0) return 'late'
  if (d === 0) return 'today'
  return `${d}d`
}

// One active sprint as a small tappable ⚡ pill — used on the road (near the
// current stone) and on the celestial map (loose sprints, near home).
function SprintPill({ sprint, color, onPress }) {
  const due = sprintDueLabel(sprint.dueDate)
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 160, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: color + '24', borderWidth: 1, borderColor: color + '5A' }}>
      <Zap size={10} color={color} strokeWidth={2.4} fill={color} />
      <Text numberOfLines={1} style={{ fontFamily: F.semibold, fontSize: 10, color: C.ink2, flexShrink: 1 }}>{sprint.title}</Text>
      {!!due && <Text style={{ fontFamily: F.bold, fontSize: 9, color }}>· {due}</Text>}
    </Pressable>
  )
}

export default function Roadmap({ profile, onUpdate, onRedoGoal, onOpenSprints }) {
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
    // Sanitize each goal's progress (legacy/AI-written values can be missing or
    // out of range) — this average renders permanently under the North Star.
    () => (goals.length ? clampN(Math.round(goals.reduce((s, g) => s + clampN(Math.round(g.progress || 0), 0, 100), 0) / goals.length), 0, 100) : 0),
    [profile],
  )
  // Each goal's signature colour (category colour, hue-shifted when goals share
  // one) — used for its planet, its road, and everything tinted to it.
  const goalColors = useMemo(() => goalColorMap(goals), [goals])
  const accent = goal ? goalColors[goal.id] || C.amber : C.amber

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
      scrollY.setValue(0) // fresh view starts at the top — reset the parallax baseline
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

  // ── Active sprints ──────────────────────────────────────────────────────────
  // On a goal's path, that goal's sprints ride the road just up-road from the
  // current stepping stone. Sprints not tied to any goal live on the celestial
  // map instead (handled there). Every pin taps through to the Sprints tab.
  const sprintActive = (s) => (s.steps?.length ? !s.steps.every((st) => st.completed) : !s.completed)
  const liveSprints = (profile.sprints || []).filter(sprintActive)
  const roadSprints = goal ? liveSprints.filter((s) => s.linkedGoalId === goal.id) : []
  const squareOnePoint = { x: W / 2, y: geo.height - PAD_BOTTOM }
  let sprintAnchor = squareOnePoint
  if (goal) {
    const fi = nodes.findIndex((n) => n.type === 'step' && stepStatusOf(n.milestone.id, n.step.id) === 'current')
    sprintAnchor = nodePoints[fi] || nodePoints[nodePoints.length - 1] || squareOnePoint
  }

  // The celestial map's content height (mirrors CelestialMap's layout math) so
  // the dream view's parallax spans the REAL scrollable height — the phantom
  // 2-node road geo would freeze the stars early on tall maps (many goals).
  const looseSprintCount = liveSprints.filter((s) => !s.linkedGoalId).length
  const mapH = Math.max(600, (goals.length ? 288 + (goals.length - 1) * 148 : 128) + 160 + (looseSprintCount ? 30 + Math.min(looseSprintCount, 4) * 26 : 0))

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

      {/* On a goal's path, a slim constellation strip hops between paths and back
          to the Dream. The Dream overview needs no switcher — the map below IS
          the switcher (tap a planet). */}
      {goal && <ConstellationStrip goals={goals} view={view} onSelect={(id) => { setView(id); setSelected(null); setExpandedStep(null) }} />}

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
                  inputRange: [0, Math.max(1, goal ? geo.height : mapH)],
                  outputRange: [0, -150],
                  extrapolate: 'clamp',
                }),
              },
            ],
          }}
        >
          <StarField count={70} seed={goal ? 21 : 7} maxTop={100} />
        </Animated.View>

        {goal ? (
        <Animated.ScrollView
          // Remount per path: a goal→goal hop then starts at offset 0 (matching
          // the scrollY reset) and the mount-time scrollToEnd re-syncs both —
          // otherwise the reused scroller keeps its old offset and the parallax
          // starfield jumps out of step with it.
          key={view}
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
            onPress={() => setSelected({ horizon: 'The summit', title: goal.title, detail: `${pct}% of the path is lit`, lit: pct >= 100, accent })}
            style={[styles.marker, { top: PAD_TOP - 34, left: W / 2 - 110, width: 220 }]}
          >
            <Text style={{ fontSize: 30 }}>{pct >= 100 ? '🏆' : '✦'}</Text>
            <Text style={[styles.summitLabel, { color: C.amber }]}>{goal.title}</Text>
          </Pressable>

          {/* Active sprints — small ⚡ pins stacked just up-road from the current
              stepping stone. Up to three show; a "+N" pin covers the rest. Every
              pin taps through to the Sprints tab. */}
          {roadSprints.slice(0, 3).map((s, i) => (
            <View key={s.id} pointerEvents="box-none" style={{ position: 'absolute', top: sprintAnchor.y - 46 - i * 26, left: Math.max(8, Math.min(sprintAnchor.x - 80, W - 168)), width: 160, alignItems: 'center' }}>
              <SprintPill sprint={s} color={accent} onPress={onOpenSprints} />
            </View>
          ))}
          {roadSprints.length > 3 && (
            <View pointerEvents="box-none" style={{ position: 'absolute', top: sprintAnchor.y - 46 - 3 * 26, left: Math.max(8, Math.min(sprintAnchor.x - 80, W - 168)), width: 160, alignItems: 'center' }}>
              <Pressable onPress={onOpenSprints} hitSlop={6} style={{ borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, backgroundColor: accent + '18', borderWidth: 1, borderColor: accent + '45' }}>
                <Text style={{ fontFamily: F.bold, fontSize: 9.5, color: accent }}>+{roadSprints.length - 3} more sprint{roadSprints.length - 3 === 1 ? '' : 's'}</Text>
              </Pressable>
            </View>
          )}
        </View>
        </Animated.ScrollView>
        ) : (
          <CelestialMap
            goals={goals}
            dreamPct={dreamPct}
            sprints={liveSprints}
            W={W}
            H={mapH}
            pulse={pulse}
            scrollY={scrollY}
            onSelectGoal={(id) => { setView(id); setSelected(null); setExpandedStep(null) }}
            onStarPress={() => setSelected({ horizon: 'The dream', title: 'The Dream', detail: `${dreamPct}% of the whole journey is lit`, lit: dreamPct >= 100, accent: C.amber })}
            onOpenSprints={onOpenSprints}
          />
        )}
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

const clampN = (v, lo, hi) => Math.max(lo, Math.min(v, hi))

// Lighten (+amt) or darken (−amt) a #rrggbb hex — shades a planet's sphere from
// its category colour.
function shade(hex, amt) {
  const h = (hex || C.amber).replace('#', '')
  const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h
  const n = parseInt(full, 16)
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)))
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`
}

// ── Colour helpers so same-category goals don't render as identical planets ──
function hexToHsl(hex) {
  let s = (hex || '#000000').replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  const r = parseInt(s.slice(0, 2), 16) / 255, g = parseInt(s.slice(2, 4), 16) / 255, b = parseInt(s.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  const l = (max + min) / 2
  return { h, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l }
}
function hslToHex({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// A stable goal-id → planet-colour map. The first goal of a category keeps its
// true category colour; each later goal sharing that colour is rotated a step in
// hue (±30°, fanning both ways) so the sky always shows distinct worlds — never
// a row of identical planets when several goals share a category.
function goalColorMap(goals) {
  const seen = {}
  const out = {}
  ;(goals || []).forEach((g) => {
    const base = CATEGORY_COLORS[g.category] || C.amber
    const k = (seen[base] = (seen[base] === undefined ? -1 : seen[base]) + 1)
    if (k === 0) { out[g.id] = base; return }
    const hsl = hexToHsl(base)
    const step = Math.ceil(k / 2) * (k % 2 ? 1 : -1) // +1, −1, +2, −2, …
    out[g.id] = hslToHex({ h: (hsl.h + step * 30 + 360) % 360, s: hsl.s, l: hsl.l })
  })
  return out
}

// A planet's SVG canvas is padded beyond its sphere so its ring fits.
const planetCanvas = (size) => size + Math.ceil(size * 0.35) * 2

// A goal as a small planet: a radial-gradient sphere in the goal's category
// colour, lit from the upper-left like everything else in this sky. Each index
// gets a signature look — craters, a ring, or a clean sphere — so the planets
// read as distinct worlds. `uid` keeps gradient ids unique per mounted instance.
function Planet({ size, color, idx, uid }) {
  const cv = planetCanvas(size)
  const c = cv / 2
  const r = size / 2
  const gid = `pg-${uid}`
  const deco = idx % 3
  return (
    <Svg width={cv} height={cv}>
      <Defs>
        <RadialGradient id={gid} cx="35%" cy="30%" r="80%">
          <Stop offset="0" stopColor={shade(color, 85)} />
          <Stop offset="0.45" stopColor={color} />
          <Stop offset="1" stopColor={shade(color, -95)} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={r} fill={`url(#${gid})`} />
      {deco === 0 && (
        <>
          <Circle cx={c + r * 0.28} cy={c + r * 0.2} r={r * 0.2} fill="rgba(0,0,0,0.22)" />
          <Circle cx={c - r * 0.24} cy={c + r * 0.42} r={r * 0.13} fill="rgba(0,0,0,0.18)" />
          <Circle cx={c + r * 0.05} cy={c - r * 0.38} r={r * 0.11} fill="rgba(255,255,255,0.14)" />
        </>
      )}
      {deco === 1 && (
        <Ellipse cx={c} cy={c} rx={r * 1.55} ry={r * 0.42} fill="none" stroke={shade(color, 45)} strokeOpacity={0.55} strokeWidth={Math.max(1.2, size * 0.05)} transform={`rotate(-16 ${c} ${c})`} />
      )}
      {/* deco === 2 → a clean, featureless sphere (the third distinct look) */}
    </Svg>
  )
}

// THE DREAM overview — a celestial map. The North Star (the dream) shines at the
// top; every goal is a planet below with a line running up to it. Each line
// lights up from the planet toward the star to the goal's progress (and GLIDES
// when it changes, like the road). Tap a planet to walk that goal's path; tap
// the star for the dream card. Goal-linked sprints show as a ⚡ satellite on
// their planet; sprints not tied to a goal float near home at the bottom.
function CelestialMap({ goals, dreamPct, sprints, W, H, pulse, scrollY, onSelectGoal, onStarPress, onOpenSprints }) {
  const STAR_Y = 128
  const P_Y0 = 288
  const P_DY = 148
  const colors = goalColorMap(goals)
  const rows = goals.map((g, i) => {
    // Zigzag down from the star with a touch of deterministic jitter, so the
    // planets scatter like a constellation instead of sitting on rails.
    const xf = (i % 2 === 0 ? 0.28 : 0.72) + (((i * 53) % 5) - 2) / 100
    return {
      id: g.id,
      title: g.title,
      color: colors[g.id] || C.amber,
      pct: clampN(Math.round(g.progress || 0), 0, 100),
      x: Math.round(xf * W),
      y: P_Y0 + i * P_DY,
      size: [42, 34, 38, 32, 40][i % 5],
      sprints: sprints.filter((s) => s.linkedGoalId === g.id).length,
    }
  })
  const loose = sprints.filter((s) => !s.linkedGoalId)
  // H (content height) arrives from Roadmap, which mirrors this layout's math so
  // the parallax starfield can span the same height.
  const sx = W / 2
  const sy = STAR_Y

  // One Animated.Value per goal-line — glides to the new pct when a stepping
  // stone lands, exactly like the road's lit portion.
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
    <Animated.ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 120 }}
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
    >
      <View style={{ width: W, alignSelf: 'center', height: H }}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Defs>
            {rows.map((r) => (
              <SvgGrad key={r.id} id={`ll-${r.id}`} x1={r.x} y1={r.y} x2={sx} y2={sy} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={r.color} />
                <Stop offset="1" stopColor={C.amber} />
              </SvgGrad>
            ))}
          </Defs>
          {rows.map((r) => {
            const my = (r.y + sy) / 2
            const d = `M ${r.x} ${r.y} C ${r.x} ${my}, ${sx} ${my}, ${sx} ${sy}`
            return (
              <React.Fragment key={r.id}>
                {/* the line to the dream, and the lit portion you've climbed */}
                <Path d={d} stroke="rgba(167,139,250,0.22)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                <AnimatedPath
                  d={d}
                  stroke={`url(#ll-${r.id})`}
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray="100 100"
                  strokeDashoffset={animRef[r.id].interpolate({ inputRange: [0, 100], outputRange: [100, 0] })}
                />
              </React.Fragment>
            )
          })}
        </Svg>

        {/* The North Star — the dream itself, breathing */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: sx - 34,
            top: sy - 34,
            width: 68,
            height: 68,
            borderRadius: 34,
            backgroundColor: C.amber,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.16] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
          }}
        />
        <Pressable onPress={onStarPress} hitSlop={10} style={{ position: 'absolute', left: sx - 33, top: sy - 33, width: 66, height: 66, alignItems: 'center', justifyContent: 'center' }}>
          <GoldStar size={66} glow />
        </Pressable>
        <Text style={{ position: 'absolute', top: sy + 44, left: sx - 90, width: 180, textAlign: 'center', fontFamily: F.semibold, fontSize: 11, color: C.amber }}>
          {dreamPct}% of the journey
        </Text>

        {/* The planets — one per goal */}
        {rows.map((r, i) => {
          const cv = planetCanvas(r.size)
          const complete = r.pct >= 100
          return (
            <View key={r.id} pointerEvents="box-none" style={{ position: 'absolute', left: r.x - 70, top: r.y - cv / 2, width: 140, alignItems: 'center' }}>
              <Pressable onPress={() => onSelectGoal(r.id)} hitSlop={8} style={{ alignItems: 'center' }}>
                <View style={[{ width: cv, height: cv, borderRadius: cv / 2, alignItems: 'center', justifyContent: 'center' }, complete && { shadowColor: r.color, shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }]}>
                  <Planet size={r.size} color={r.color} idx={i} uid={`m-${r.id}`} />
                  {/* how far this world has come */}
                  <View pointerEvents="none" style={{ position: 'absolute' }}>
                    <ProgressRing pct={r.pct} color={r.color} size={r.size + 14} />
                  </View>
                  {/* active sprints on this goal orbit as a ⚡ satellite */}
                  {r.sprints > 0 && (
                    <Pressable onPress={onOpenSprints} hitSlop={6} style={{ position: 'absolute', top: 0, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: C.bg, borderWidth: 1, borderColor: r.color + '80', alignItems: 'center', justifyContent: 'center' }}>
                      <Zap size={9} color={r.color} fill={r.color} strokeWidth={2.4} />
                    </Pressable>
                  )}
                </View>
                <Text numberOfLines={2} style={{ marginTop: 2, width: 132, textAlign: 'center', fontFamily: F.semibold, fontSize: 11.5, lineHeight: 15, color: C.ink2 }}>{r.title}</Text>
                <Text style={{ marginTop: 2, fontFamily: F.bold, fontSize: 10.5, color: r.color }}>{complete ? '🏆 100%' : `${r.pct}%`}</Text>
              </Pressable>
            </View>
          )
        })}

        {rows.length === 0 && (
          <Text style={{ position: 'absolute', top: sy + 150, left: 32, right: 32, textAlign: 'center', fontFamily: F.body, fontSize: 13, lineHeight: 20, color: C.dim }}>
            No goals yet — talk to Nova to chart your path.
          </Text>
        )}

        {/* Sprints not tied to a goal — floating near home, tap → Sprints */}
        {loose.slice(0, 3).map((s, i) => (
          <View key={s.id} pointerEvents="box-none" style={{ position: 'absolute', top: H - 100 - i * 26, left: W / 2 - 80, width: 160, alignItems: 'center' }}>
            <SprintPill sprint={s} color={C.amber} onPress={onOpenSprints} />
          </View>
        ))}
        {loose.length > 3 && (
          <View pointerEvents="box-none" style={{ position: 'absolute', top: H - 100 - 3 * 26, left: W / 2 - 80, width: 160, alignItems: 'center' }}>
            <Pressable onPress={onOpenSprints} hitSlop={6} style={{ borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, backgroundColor: C.amber + '18', borderWidth: 1, borderColor: C.amber + '45' }}>
              <Text style={{ fontFamily: F.bold, fontSize: 9.5, color: C.amber }}>+{loose.length - 3} more sprint{loose.length - 3 === 1 ? '' : 's'}</Text>
            </Pressable>
          </View>
        )}

        {rows.length > 0 && (
          <Text style={{ position: 'absolute', top: H - 58, left: 0, width: W, textAlign: 'center', fontFamily: F.medium, fontSize: 10.5, color: C.faint2 }}>
            Tap a planet to walk its path
          </Text>
        )}
      </View>
    </Animated.ScrollView>
  )
}

// The slim switcher shown on a goal's path: the Dream star plus each goal as a
// mini planet wearing its progress arc. Tap to hop paths, or the star to zoom
// back out to the map.
function ConstellationStrip({ goals, view, onSelect }) {
  const colors = goalColorMap(goals)
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', columnGap: 16, rowGap: 8, paddingHorizontal: 12, marginTop: 8, marginBottom: 4 }}>
      <Pressable onPress={() => onSelect('dream')} hitSlop={8} style={{ alignItems: 'center' }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.lineStrong }}>
          <Text style={{ fontSize: 13, color: C.amber }}>✦</Text>
        </View>
        <Text style={{ marginTop: 3, fontFamily: F.medium, fontSize: 8.5, color: C.faint }}>Dream</Text>
      </Pressable>
      {goals.map((g, i) => {
        const on = view === g.id
        const color = colors[g.id] || C.amber
        const pct = clampN(Math.round(g.progress || 0), 0, 100)
        return (
          <Pressable key={g.id} onPress={() => onSelect(g.id)} hitSlop={6} style={{ alignItems: 'center', opacity: on ? 1 : 0.5 }}>
            <View style={[{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, on && { shadowColor: color, shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]}>
              <Planet size={18} color={color} idx={i} uid={`s-${g.id}`} />
              <View pointerEvents="none" style={{ position: 'absolute' }}>
                <ProgressRing pct={pct} color={color} size={28} />
              </View>
            </View>
            <Text style={{ marginTop: 3, fontFamily: on ? F.bold : F.medium, fontSize: 8.5, color: on ? color : C.faint }}>{pct}%</Text>
          </Pressable>
        )
      })}
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
