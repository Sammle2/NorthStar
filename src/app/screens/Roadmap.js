import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgGrad, Path, RadialGradient, Stop } from 'react-native-svg'
import { Map, Plus, RotateCcw, Sparkles, TrendingUp, Zap } from 'lucide-react-native'
import { C, F } from '../tokens'
import { CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS, normalizeCategory } from '../mockData'
import StoneTrack from '../../momentum/StoneTrack'
import StoneBuilder from '../../momentum/StoneBuilder'
import GoalMomentumBar from '../../momentum/GoalMomentumBar'
import StoneRoad from '../../momentum/StoneRoad'
import { hasR2 } from '../../momentum/model'
import { buildGoal, canAddGoal } from '../aiEngine'
import { generateGoalsForFocus } from '../../services/aiService'
import StarField from '../components/StarField'
import { GoldStar } from '../components/StarMark'

// A local starter goal per category — used only when NOVA's proposal is
// unavailable (offline) for an in-app "create a goal in this category" tap.
// Each is an OUTCOME/identity to reach, never a recurring task (the daily work
// lives in tasks; the measurable milestones live in checkpoints).
const STARTER_TITLES = {
  mind: 'Become a Sharp, Focused Thinker',
  body: 'Build a Strong, Energized Body',
  spirit: 'Cultivate Lasting Inner Peace',
  work: 'Build a Career I’m Proud Of',
  relationships: 'Build Deep, Lasting Relationships',
}

// The lit road + the celestial map's goal-lines animate their length, so an SVG
// Path that takes an Animated strokeDashoffset.
const AnimatedPath = Animated.createAnimatedComponent(Path)

// The Roadmap has two faces:
//  · THE DREAM (overview) — a celestial map: every goal is a planet with a line
//    running up to the North Star (the dream). Each line lights up to the goal's
//    progress; tap a planet to walk that goal's path.
//  · A GOAL — opens on its MOMENTUM page (the current checkpoint, its momentum,
//    the Progress input, and today's tasks). A top toggle flips to the celestial
//    ROADMAP: the winding violet→gold road plotting this goal's checkpoints
//    (measurable, outcome-bound — never a 3/6/12-month timeline). A goal that
//    hasn't laid its checkpoints yet shows the momentum setup here instead. A slim
//    constellation strip up top hops between categories and back to the Dream.

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

export default function Roadmap({ profile, onUpdate, onOpenSprints }) {
  // Size the road to the ACTUAL container, not the window: on web the app lives in
  // a fixed 375px phone frame while the window is much wider — useWindowDimensions
  // alone would build a 520px road that overflows the frame and clips edge labels.
  const win = useWindowDimensions()
  const [containerW, setContainerW] = useState(0)
  const W = Math.min(containerW || win.width || 520, 520)

  const goals = profile.goals
  const [view, setView] = useState('dream')
  const [selected, setSelected] = useState(null)
  // A goal opens on its Momentum page; a top toggle flips to the celestial
  // roadmap ('momentum' | 'roadmap').
  const [goalView, setGoalView] = useState('momentum')
  // "Redo" opens the checkpoint builder (StoneBuilder) to re-lay this goal's
  // outcome, checkpoints & tasks — replacing the old milestone editor.
  const [redoing, setRedoing] = useState(false)

  // Scroll position drives the parallax starfield (stars drift slower than the road).
  const scrollY = useRef(new Animated.Value(0)).current
  // A slow pulse for the North Star's breathing glow on the celestial map.
  const pulse = useRef(new Animated.Value(0)).current
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
  // A category view ('cat:<key>') shows one category's goals (or its empty
  // prompt) — no single goal is selected.
  const catView = typeof view === 'string' && view.startsWith('cat:') ? view.slice(4) : null
  const goalsInCategory = (key) => goals.filter((g) => normalizeCategory(g.category) === key)
  const [creating, setCreating] = useState(null) // category key while NOVA drafts a new goal
  // A just-created goal we've navigated to: skip the disappear-bounce for it
  // until its onUpdate lands in `goals` (guards the create→setView state race).
  const pendingGoalRef = useRef(null)
  // If the viewed goal disappears (e.g. NOVA removed it via chat), fall back to
  // the Dream view instead of leaving the switcher pointing at a dead id. A
  // category view is valid without a goal, so it's exempt.
  useEffect(() => {
    if (goal && pendingGoalRef.current) pendingGoalRef.current = null
    if (view !== 'dream' && !catView && !goal && view !== pendingGoalRef.current) {
      setView('dream')
      setSelected(null)
    }
  }, [view, goal, catView])

  // Tapping a category resolves by how many goals it holds: exactly one opens
  // that goal's road; zero or many open the category view (empty prompt, or the
  // goal list with "add another").
  const openCategory = (key) => {
    setSelected(null)
    const g = goalsInCategory(key)
    setView(g.length === 1 ? g[0].id : `cat:${key}`)
  }

  // Create a goal in a category from the intake — capped at 5 total / 3 per
  // category. NOVA drafts a fitting title (local starter if offline); the goal
  // is a scaffold the background upgrader later specializes into a full roadmap.
  const createGoalInCategory = async (key) => {
    if (creating) return
    const check = canAddGoal(goals, key)
    if (!check.ok) {
      setSelected({ horizon: CATEGORY_LABELS[key], title: 'Not just yet', detail: check.reason, lit: false, accent: CATEGORY_COLORS[key] })
      return
    }
    setCreating(key)
    let title = ''
    try {
      const ai = await generateGoalsForFocus({ focus: { [key]: 1 }, ratings: profile.categoryRatings || {}, pursuing: profile.currentPursuits || '', name: profile.name, tone: profile.coachTone })
      const hit = (ai || []).find((x) => normalizeCategory(x.category) === key) || (ai || [])[0]
      title = hit && String(hit.title || '').trim()
    } catch (e) { /* fall back to a local starter */ }
    if (!title) title = STARTER_TITLES[key] || `New ${CATEGORY_LABELS[key]} Goal`
    const newGoal = buildGoal(title, '', `goal-${Date.now().toString(36)}`, key)
    pendingGoalRef.current = newGoal.id // survive the create→setView render race
    // Functional updater: this write lands AFTER the AI wait, so it must merge
    // onto the CURRENT profile (a stone toggled or goal added meanwhile must
    // survive) — and the cap is re-checked against those current goals too.
    let blocked = null
    onUpdate((prof) => {
      const recheck = canAddGoal(prof.goals, key)
      if (!recheck.ok) { blocked = recheck.reason; return prof }
      return { ...prof, goals: [...(prof.goals || []), newGoal] }
    })
    setCreating(null)
    if (blocked) {
      pendingGoalRef.current = null
      setSelected({ horizon: CATEGORY_LABELS[key], title: 'Not just yet', detail: blocked, lit: false, accent: CATEGORY_COLORS[key] })
      return
    }
    setView(newGoal.id) // straight into the new goal's road
  }
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

  // The goal's headline progress (0–100). For a Dream that's laid its checkpoints
  // this is checkpoint-derived (goal.progress is kept in step by the momentum
  // store); otherwise it's whatever the goal already carries.
  const pct = goal ? goal.progress : dreamPct
  // On a path change, reset the parallax baseline and drop back to the Momentum
  // page — so every goal opens on its Momentum face, scrolled to the top.
  useEffect(() => {
    if (prevViewRef.current !== view) {
      prevViewRef.current = view
      scrollY.setValue(0)
      setGoalView('momentum')
    }
  }, [view])

  // ── Active sprints ──────────────────────────────────────────────────────────
  // Sprints not tied to any goal float on the celestial map (handled there); each
  // pin taps through to the Sprints tab.
  const sprintActive = (s) => (s.steps?.length ? !s.steps.every((st) => st.completed) : !s.completed)
  const liveSprints = (profile.sprints || []).filter(sprintActive)

  // The celestial map's content height (mirrors CelestialMap's layout math) so
  // the dream view's parallax spans the REAL scrollable height on tall maps.
  const looseSprintCount = liveSprints.filter((s) => !s.linkedGoalId).length
  const mapH = Math.max(600, 288 + (CATEGORIES.length - 1) * 148 + 160 + (looseSprintCount ? 30 + Math.min(looseSprintCount, 4) * 26 : 0))

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 56, paddingBottom: 6 }}>
        <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 3 }}>{catView ? 'YOUR GOALS IN' : 'YOUR PATH TO'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <Text numberOfLines={2} style={{ flex: 1, fontFamily: F.display, fontSize: 20, color: C.ink, letterSpacing: 0.8, lineHeight: 26 }}>
            {goal ? goal.title.toUpperCase() : catView ? CATEGORY_LABELS[catView].toUpperCase() : 'THE DREAM'}
          </Text>
          {goal && (
            <Pressable onPress={() => setRedoing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineStrong }}>
              <RotateCcw size={13} color={C.violet} strokeWidth={2.2} />
              <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.violet }}>Redo</Text>
            </Pressable>
          )}
        </View>
        {/* Goal complete → re-lay the Dream (name a fresh outcome, checkpoints & tasks). */}
        {goal && pct >= 100 && (
          <Pressable onPress={() => setRedoing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)' }}>
            <Text style={{ flex: 1, fontFamily: F.body, fontSize: 12.5, color: C.amber, lineHeight: 18 }}>
              🎉 You’ve reached this goal! Ready for what’s next? Redo it to set a fresh outcome.
            </Text>
            <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.amberInk, backgroundColor: C.amber, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' }}>Redo</Text>
          </Pressable>
        )}
      </View>

      {/* Momentum-first goal view: a top toggle flips between the Momentum page
          (default — current checkpoint, momentum, the Progress input, today's
          tasks) and the celestial roadmap. Only shown once the Dream has laid its
          checkpoints; before that the Momentum page hosts the setup itself. */}
      {goal && hasR2(goal) && <GoalViewToggle value={goalView} onChange={setGoalView} accent={accent} />}

      {/* On a goal's path or a category view, a slim constellation strip hops
          between the five categories and back to the Dream. The Dream overview
          needs no switcher — the map below IS the switcher (tap a planet). */}
      {(goal || catView) && (
        <ConstellationStrip
          goals={goals}
          activeCat={goal ? normalizeCategory(goal.category) : catView}
          onSelectDream={() => { setView('dream'); setSelected(null) }}
          onSelectCategory={openCategory}
        />
      )}

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
                  inputRange: [0, Math.max(1, goal ? 1200 : mapH)],
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
          goalView === 'roadmap' && hasR2(goal) ? (
            // The celestial ROADMAP page — this Dream's checkpoints plotted on the
            // winding violet->gold road. Display-only: it advances as you log real
            // progress on the Momentum page. Never a 3/6/12-month timeline.
            <StoneRoad goal={goal} />
          ) : (
            // The MOMENTUM page (default) — the current checkpoint, its momentum,
            // the Progress input, and today's tasks. A Dream that hasn't laid its
            // checkpoints yet shows the setup here instead of any dated milestones.
            <Animated.ScrollView
              key={`mom-${view}`}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 130 }}
              scrollEventThrottle={16}
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
            >
              <StoneTrack goal={goal} onUpdate={onUpdate} situation={profile.situation || profile.dreamDescription || ''} />
            </Animated.ScrollView>
          )
        ) : catView ? (
          <CategoryView
            key={catView}
            categoryKey={catView}
            goals={goalsInCategory(catView)}
            creating={creating === catView}
            W={W}
            scrollY={scrollY}
            onSelectGoal={(id) => { setView(id); setSelected(null) }}
            onCreate={() => createGoalInCategory(catView)}
          />
        ) : (
          <CelestialMap
            goals={goals}
            dreamPct={dreamPct}
            sprints={liveSprints}
            W={W}
            H={mapH}
            pulse={pulse}
            scrollY={scrollY}
            onSelectCategory={openCategory}
            creating={creating}
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

      {/* Redo → the checkpoint builder: re-name the outcome and re-lay this goal's
          checkpoints & tasks (replaces goal.r2). A full-screen Modal. */}
      {redoing && goal && (
        <StoneBuilder
          goal={goal}
          onUpdate={onUpdate}
          situation={profile.situation || profile.dreamDescription || ''}
          onClose={() => setRedoing(false)}
        />
      )}
    </View>
  )
}

// The top toggle on a goal view: the Momentum page (the doing surface — current
// checkpoint, its momentum, the Progress input, today's tasks) vs. the celestial
// Roadmap (the winding checkpoint road). A goal always opens on Momentum; tap
// "Roadmap" to see the road.
function GoalViewToggle({ value, onChange, accent = C.amber }) {
  const opts = [
    { key: 'momentum', label: 'Momentum', Icon: TrendingUp },
    { key: 'roadmap', label: 'Roadmap', Icon: Map },
  ]
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 24, marginTop: 10, marginBottom: 2 }}>
      {opts.map((o) => {
        const on = value === o.key
        const tint = o.key === 'roadmap' ? accent : C.violet
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 999, paddingVertical: 10, backgroundColor: on ? tint + '1E' : 'rgba(13,13,27,0.7)', borderWidth: 1, borderColor: on ? tint : C.line }}
          >
            <o.Icon size={14} color={on ? tint : C.faint} strokeWidth={2.2} />
            <Text style={{ fontFamily: on ? F.bold : F.medium, fontSize: 12.5, color: on ? tint : C.dim }}>{o.label}</Text>
          </Pressable>
        )
      })}
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

// Average progress across a set of goals (0 when the category is empty).
const categoryPct = (catGoals) =>
  catGoals.length ? clampN(Math.round(catGoals.reduce((s, g) => s + clampN(Math.round(g.progress || 0), 0, 100), 0) / catGoals.length), 0, 100) : 0

// THE DREAM overview — a celestial map. The North Star (the dream) shines at the
// top; the FIVE life categories are planets below, each with a line running up
// to it. A category's line lights up to its goals' average progress (and GLIDES
// when it changes). Tap a category to explore it — one goal opens its road, more
// open the category view, none offers to create one. A category with an active
// linked sprint wears a ⚡ satellite; sprints tied to no goal float near home.
function CelestialMap({ goals, dreamPct, sprints, W, H, pulse, scrollY, onSelectCategory, creating, onStarPress, onOpenSprints }) {
  const STAR_Y = 128
  const P_Y0 = 288
  const P_DY = 148
  const rows = CATEGORIES.map((c, i) => {
    const catGoals = goals.filter((g) => normalizeCategory(g.category) === c.key)
    // Zigzag down from the star with a touch of deterministic jitter, so the
    // planets scatter like a constellation instead of sitting on rails.
    const xf = (i % 2 === 0 ? 0.28 : 0.72) + (((i * 53) % 5) - 2) / 100
    return {
      key: c.key,
      label: c.label,
      color: c.color,
      count: catGoals.length,
      pct: categoryPct(catGoals),
      x: Math.round(xf * W),
      y: P_Y0 + i * P_DY,
      size: catGoals.length ? 42 : 34,
      sprints: sprints.filter((s) => s.linkedGoalId && catGoals.some((g) => g.id === s.linkedGoalId)).length,
    }
  })
  const loose = sprints.filter((s) => !s.linkedGoalId)
  const sx = W / 2
  const sy = STAR_Y

  // One Animated.Value per category-line — glides to the new average pct.
  const animRef = useRef({}).current
  rows.forEach((r) => { if (!animRef[r.key]) animRef[r.key] = new Animated.Value(r.pct) })
  const pctKey = rows.map((r) => `${r.key}:${r.pct}`).join('|')
  useEffect(() => {
    rows.forEach((r) => {
      Animated.timing(animRef[r.key], { toValue: r.pct, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
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
              <SvgGrad key={r.key} id={`ll-${r.key}`} x1={r.x} y1={r.y} x2={sx} y2={sy} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={r.color} />
                <Stop offset="1" stopColor={C.amber} />
              </SvgGrad>
            ))}
          </Defs>
          {rows.map((r) => {
            const my = (r.y + sy) / 2
            const d = `M ${r.x} ${r.y} C ${r.x} ${my}, ${sx} ${my}, ${sx} ${sy}`
            return (
              <React.Fragment key={r.key}>
                {/* the line to the dream, and the lit portion the category has climbed */}
                <Path d={d} stroke="rgba(167,139,250,0.18)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                <AnimatedPath
                  d={d}
                  stroke={`url(#ll-${r.key})`}
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray="100 100"
                  strokeDashoffset={animRef[r.key].interpolate({ inputRange: [0, 100], outputRange: [100, 0] })}
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

        {/* The planets — one per category (all five, always) */}
        {rows.map((r, i) => {
          const cv = planetCanvas(r.size)
          const empty = r.count === 0
          const complete = !empty && r.pct >= 100
          return (
            <View key={r.key} pointerEvents="box-none" style={{ position: 'absolute', left: r.x - 70, top: r.y - cv / 2, width: 140, alignItems: 'center' }}>
              <Pressable onPress={() => onSelectCategory(r.key)} hitSlop={8} style={{ alignItems: 'center', opacity: empty ? 0.6 : 1 }}>
                <View style={[{ width: cv, height: cv, borderRadius: cv / 2, alignItems: 'center', justifyContent: 'center' }, complete && { shadowColor: r.color, shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }]}>
                  <Planet size={r.size} color={r.color} idx={i} uid={`m-${r.key}`} />
                  {!empty && (
                    <View pointerEvents="none" style={{ position: 'absolute' }}>
                      <ProgressRing pct={r.pct} color={r.color} size={r.size + 14} />
                    </View>
                  )}
                  {/* an active sprint in this category orbits as a ⚡ satellite */}
                  {r.sprints > 0 && (
                    <Pressable onPress={onOpenSprints} hitSlop={6} style={{ position: 'absolute', top: 0, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: C.bg, borderWidth: 1, borderColor: r.color + '80', alignItems: 'center', justifyContent: 'center' }}>
                      <Zap size={9} color={r.color} fill={r.color} strokeWidth={2.4} />
                    </Pressable>
                  )}
                  {/* a + on an empty category — tap to create a goal there */}
                  {empty && (
                    <View pointerEvents="none" style={{ position: 'absolute', bottom: -2, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: C.bg, borderWidth: 1, borderColor: r.color + '99', alignItems: 'center', justifyContent: 'center' }}>
                      {creating === r.key ? <ActivityIndicator size={9} color={r.color} /> : <Plus size={10} color={r.color} strokeWidth={3} />}
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} style={{ marginTop: 4, width: 132, textAlign: 'center', fontFamily: F.semibold, fontSize: 12.5, color: C.ink2 }}>{r.label}</Text>
                <Text style={{ marginTop: 1, fontFamily: F.bold, fontSize: 10, color: empty ? C.faint : r.color }}>
                  {empty ? 'no goals yet' : complete ? '🏆 100%' : `${r.count} goal${r.count === 1 ? '' : 's'} · ${r.pct}%`}
                </Text>
              </Pressable>
            </View>
          )
        })}

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

        <Text style={{ position: 'absolute', top: H - 58, left: 0, width: W, textAlign: 'center', fontFamily: F.medium, fontSize: 10.5, color: C.faint2 }}>
          Tap a category to explore it
        </Text>
      </View>
    </Animated.ScrollView>
  )
}

// The CATEGORY view — one category's goals as planets (tap → its road), plus an
// "add another goal" affordance. When the category is empty it invites creating
// the first goal there (NOVA drafts it from the intake). Reached from a category
// planet (or the strip) that holds 0 or 2+ goals.
function CategoryView({ categoryKey, goals, creating, W, scrollY, onSelectGoal, onCreate }) {
  const cat = CATEGORIES.find((c) => c.key === categoryKey) || CATEGORIES[0]
  // Match canAddGoal's per-category cap: only ACTIVE goals count, so finishing
  // one frees a slot ("finish one to start another") even inside a full category.
  const atCap = goals.filter((g) => (g.progress || 0) < 100).length >= 3
  return (
    <Animated.ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: 24, paddingBottom: 140, alignItems: 'center' }}
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
    >
      {goals.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 }}>
          <View style={{ width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
            <Planet size={64} color={cat.color} idx={0} uid={`cv-${cat.key}`} />
          </View>
          <Text style={{ marginTop: 18, textAlign: 'center', fontFamily: F.semibold, fontSize: 15, color: C.ink, lineHeight: 22 }}>
            You don’t have any goals in {cat.label} yet.
          </Text>
          <Text style={{ marginTop: 6, textAlign: 'center', fontFamily: F.body, fontSize: 12.5, color: C.dim, lineHeight: 19 }}>
            Want NOVA to create one for you, based on your intake?
          </Text>
          <Pressable onPress={onCreate} disabled={!!creating} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: cat.color + '1E', borderWidth: 1, borderColor: cat.color + '66' }}>
            {creating ? <ActivityIndicator size={14} color={cat.color} /> : <Sparkles size={15} color={cat.color} strokeWidth={2.2} />}
            <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: cat.color }}>{creating ? 'NOVA is drafting…' : 'Create a goal with NOVA'}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, maxWidth: W }}>
            {goals.map((g, i) => {
              const pct = clampN(Math.round(g.progress || 0), 0, 100)
              const complete = pct >= 100
              return (
                <Pressable key={g.id} onPress={() => onSelectGoal(g.id)} hitSlop={6} style={{ width: Math.min(150, W / 2 - 8), alignItems: 'center', marginVertical: 12 }}>
                  <View style={[{ width: planetCanvas(46), height: planetCanvas(46), borderRadius: planetCanvas(46) / 2, alignItems: 'center', justifyContent: 'center' }, complete && { shadowColor: cat.color, shadowOpacity: 0.9, shadowRadius: 14 }]}>
                    <Planet size={46} color={cat.color} idx={i} uid={`cvg-${g.id}`} />
                    <View pointerEvents="none" style={{ position: 'absolute' }}>
                      <ProgressRing pct={pct} color={cat.color} size={60} />
                    </View>
                  </View>
                  <Text numberOfLines={2} style={{ marginTop: 4, width: 140, textAlign: 'center', fontFamily: F.semibold, fontSize: 11.5, lineHeight: 15, color: C.ink2 }}>{g.title}</Text>
                  <Text style={{ marginTop: 1, fontFamily: F.bold, fontSize: 10, color: cat.color }}>{complete ? '🏆 100%' : `${pct}%`}</Text>
                  {/* Momentum roadmap: per-goal momentum score (renders only for goals that have adopted the mechanism). */}
                  <GoalMomentumBar goal={g} width={140} />
                </Pressable>
              )
            })}
          </View>
          <Pressable onPress={atCap ? undefined : onCreate} disabled={atCap || !!creating} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: atCap ? 'transparent' : cat.color + '18', borderWidth: 1, borderColor: atCap ? C.lineStrong : cat.color + '55' }}>
            {creating ? <ActivityIndicator size={13} color={cat.color} /> : <Plus size={14} color={atCap ? C.faint : cat.color} strokeWidth={2.6} />}
            <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: atCap ? C.faint : cat.color }}>
              {atCap ? 'Max 3 goals in a category' : creating ? 'NOVA is drafting…' : 'Add another goal'}
            </Text>
          </Pressable>
        </>
      )}
    </Animated.ScrollView>
  )
}

// The slim switcher shown on a goal's path / category view: the Dream star plus
// the five categories as mini planets wearing their average-progress arc. Tap a
// category to hop to it (resolves to its goal or view), or the star for the map.
function ConstellationStrip({ goals, activeCat, onSelectDream, onSelectCategory }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', columnGap: 14, rowGap: 8, paddingHorizontal: 12, marginTop: 8, marginBottom: 4 }}>
      <Pressable onPress={onSelectDream} hitSlop={8} style={{ alignItems: 'center' }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.lineStrong }}>
          <Text style={{ fontSize: 13, color: C.amber }}>✦</Text>
        </View>
        <Text style={{ marginTop: 3, fontFamily: F.medium, fontSize: 8.5, color: C.faint }}>Dream</Text>
      </Pressable>
      {CATEGORIES.map((c, i) => {
        const catGoals = goals.filter((g) => normalizeCategory(g.category) === c.key)
        const on = activeCat === c.key
        const empty = catGoals.length === 0
        const pct = categoryPct(catGoals)
        return (
          <Pressable key={c.key} onPress={() => onSelectCategory(c.key)} hitSlop={6} style={{ alignItems: 'center', opacity: on ? 1 : empty ? 0.4 : 0.6 }}>
            <View style={[{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, on && { shadowColor: c.color, shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]}>
              <Planet size={18} color={c.color} idx={i} uid={`s-${c.key}`} />
              {!empty && (
                <View pointerEvents="none" style={{ position: 'absolute' }}>
                  <ProgressRing pct={pct} color={c.color} size={28} />
                </View>
              )}
            </View>
            <Text numberOfLines={1} style={{ marginTop: 3, fontFamily: on ? F.bold : F.medium, fontSize: 8.5, color: on ? c.color : C.faint }}>{c.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  // The Dream detail card, pinned above the tab bar.
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
