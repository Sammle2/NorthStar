import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import JarvisOrb from './src/components/JarvisOrb'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import { palettes } from './src/theme'
import { loadState, saveState, dateKey, DEFAULT_STATE } from './src/storage'
import { reconcileStreaks, generateTasksFor, bumpStreak, onePercent, goalUnits, goalPct, findGoal } from './src/logic'
import { chat as jarvisChat, dreamImage } from './src/jarvis'
import { pushState, pullState } from './src/sync'
import Opening from './src/screens/Opening'
import Intake from './src/screens/Intake'
import Dashboard from './src/screens/Dashboard'
import Schedule from './src/screens/Schedule'
import Reflect from './src/screens/Reflect'
import Weekly from './src/screens/Weekly'
import Settings from './src/screens/Settings'
import CheckIn from './src/screens/CheckIn'
import Celebration from './src/components/Celebration'

// Jarvis lives center stage; the other four flank him.
const LEFT_TABS = [
  { id: 'today', label: 'Today', icon: '☰' },
  { id: 'weekly', label: 'Road Map', icon: '↗' },
]
const RIGHT_TABS = [
  { id: 'reflect', label: 'Reflect', icon: '☾' },
  { id: 'settings', label: 'Tune', icon: '⚙' },
]

export default function App() {
  const [phase, setPhase] = useState('opening') // opening → intake → main
  const [state, setState] = useState(null)
  const [tab, setTab] = useState('home')
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [celebration, setCelebration] = useState(null)
  const [toast, setToast] = useState(null)
  const [jarvisLine, setJarvisLine] = useState('…')

  const colors = palettes[state?.user?.themeMode || 'dark']

  // boot: load local (cloud snapshot on fresh installs), reconcile streaks, generate today
  useEffect(() => {
    loadState().then(async (s) => {
      let base = s
      if (!s.intakeDone) {
        const cloud = await pullState()
        if (cloud?.intakeDone) base = { ...s, ...cloud }
      }
      const next = { ...base }
      if (!next.startDate) next.startDate = dateKey()
      next.streaks = reconcileStreaks(next)
      if (next.intakeDone) {
        next.tasks = { ...next.tasks, [dateKey()]: generateTasksFor(next) }
      }
      setState(next)
      saveState(next)
    })
  }, [])

  // proactive Jarvis line for the dashboard
  useEffect(() => {
    if (phase !== 'main' || !state) return
    let cancelled = false
    jarvisChat(state, [
      {
        role: 'user',
        text: 'Give me ONE complete punchy sentence (max 18 words) for my dashboard — witty, referencing my real data. No lists, no preamble, no trailing colon.',
      },
    ]).then((line) => !cancelled && setJarvisLine(line.split('\n')[0]))
    return () => {
      cancelled = true
    }
  }, [phase])

  const update = useCallback((fn) => {
    setState((prev) => {
      const next = fn(prev)
      saveState(next)
      pushState(next) // debounced cloud backup
      return next
    })
  }, [])

  function completeTask(taskId) {
    update((prev) => {
      const key = dateKey()
      const day = (prev.tasks[key] || []).map((t) =>
        t.id === taskId ? { ...t, completed: true, skipped: false } : t,
      )
      let streaks = prev.streaks
      const task = day.find((t) => t.id === taskId)
      if (task?.linkedGoalId) streaks = bumpStreak(streaks, task.linkedGoalId)
      const next = { ...prev, tasks: { ...prev.tasks, [key]: day }, streaks }

      // the math: every daily action is a measured % toward its goal
      if (task?.linkedGoalId) {
        const found = findGoal(next, task.linkedGoalId)
        if (found) {
          const before = goalPct(prev, found.goal)
          const after = goalPct(next, found.goal)
          const delta = after - before
          if (after >= 100 && before < 100) {
            setCelebration({
              title: 'GOAL COMPLETE',
              subtitle: `"${found.goal.title}" — one step closer to ${found.dream.title}.`,
            })
          } else if (delta > 0) {
            setToast(`${delta < 1 ? delta.toFixed(1) : delta.toFixed(0)}% closer to your goal!`)
          }
        }
      }

      // cinematic moments: all priorities done, or a milestone streak
      const high = day.filter((t) => t.priority === 'high')
      if (high.length && high.every((t) => t.completed)) {
        const op = onePercent(next)
        setCelebration({
          title: 'You got 1% better today.',
          subtitle: `Compounded: +${op.compoundPct}% since you started. Keep the chain.`,
        })
      } else if (task?.linkedGoalId) {
        const c = streaks[task.linkedGoalId]?.current || 0
        if (c === 7 || c === 30 || c === 100)
          setCelebration({ title: `${c}-day streak`, subtitle: 'A milestone on the narrow path.' })
      }
      return next
    })
  }

  function skipTask(taskId) {
    update((prev) => {
      const key = dateKey()
      const day = (prev.tasks[key] || []).map((t) =>
        t.id === taskId ? { ...t, skipped: true, completed: false } : t,
      )
      return { ...prev, tasks: { ...prev.tasks, [key]: day } }
    })
  }

  function moveTask(taskId, dir) {
    update((prev) => {
      const key = dateKey()
      const day = [...(prev.tasks[key] || [])]
      const lows = day.filter((t) => t.priority === 'low')
      const i = lows.findIndex((t) => t.id === taskId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= lows.length) return prev
      const a = day.indexOf(lows[i])
      const b = day.indexOf(lows[j])
      ;[day[a], day[b]] = [day[b], day[a]]
      return { ...prev, tasks: { ...prev.tasks, [key]: day } }
    })
  }

  function finishIntake(result) {
    update((prev) => {
      const next = {
        ...prev,
        intakeDone: true,
        dreams: result.dreams,
        dreamLifeStory: result.narrative,
        dreamSeed: Math.floor(Math.random() * 1000) + 1,
      }
      next.tasks = { ...next.tasks, [dateKey()]: generateTasksFor(next) }
      return next
    })
    setPhase('main')
    setCelebration({ title: 'The path is set.', subtitle: 'Day one of the becoming starts now.' })
    // render the dream-life image in the background (Gemini)
    dreamImage(result.narrative, result.dreams.map((d) => d.title)).then((img) => {
      if (img) update((prev) => ({ ...prev, dreamImage: img }))
    })
  }

  if (!state) return <View style={{ flex: 1, backgroundColor: '#040918' }} />

  if (phase === 'opening')
    return <Opening colors={colors} onDone={() => setPhase(state.intakeDone ? 'main' : 'intake')} />

  return (
    <LinearGradient colors={colors.bgGrad} style={styles.fill}>
      <StatusBar style={state.user.themeMode === 'dark' ? 'light' : 'dark'} />

      {phase === 'intake' && <Intake colors={colors} onComplete={finishIntake} />}

      {phase === 'main' && (
        <>
          <View style={styles.fill}>
            {tab === 'home' && (
              <Dashboard
                state={state}
                colors={colors}
                jarvisLine={jarvisLine}
                onCheckIn={() => setCheckInOpen(true)}
                onToggleTask={completeTask}
                setPersonality={(p) =>
                  update((prev) => ({ ...prev, user: { ...prev.user, jarvisPersonality: p } }))
                }
              />
            )}
            {tab === 'today' && (
              <Schedule state={state} colors={colors} onComplete={completeTask} onSkip={skipTask} onMove={moveTask} />
            )}
            {tab === 'weekly' && <Weekly state={state} colors={colors} />}
            {tab === 'reflect' && (
              <Reflect
                state={state}
                colors={colors}
                onSave={(key, r) =>
                  update((prev) => ({ ...prev, reflections: { ...prev.reflections, [key]: r } }))
                }
              />
            )}
            {tab === 'settings' && (
              <Settings
                state={state}
                colors={colors}
                setPersonality={(p) =>
                  update((prev) => ({ ...prev, user: { ...prev.user, jarvisPersonality: p } }))
                }
                setThemeMode={(m) =>
                  update((prev) => ({ ...prev, user: { ...prev.user, themeMode: m } }))
                }
                onResetIntake={() => {
                  update((prev) => ({ ...DEFAULT_STATE, user: prev.user, startDate: prev.startDate }))
                  setPhase('intake')
                }}
              />
            )}
          </View>

          {/* tab bar — Jarvis spills over the center, lights pulsing around him */}
          <View>
            <View style={[styles.tabBar, { backgroundColor: colors.raised, borderColor: colors.lineStrong }]}>
              {LEFT_TABS.map((t) => (
                <TabButton key={t.id} t={t} active={tab === t.id} colors={colors} onPress={() => setTab(t.id)} />
              ))}
              <View style={styles.tab} pointerEvents="none" />
              {RIGHT_TABS.map((t) => (
                <TabButton key={t.id} t={t} active={tab === t.id} colors={colors} onPress={() => setTab(t.id)} />
              ))}
            </View>
            <OrbTab
              active={tab === 'home'}
              alert={!(state.chat || []).some((m) => (m.ts || '').slice(0, 10) === dateKey())}
              colors={colors}
              onPress={() => setTab('home')}
            />
          </View>

          <Modal visible={checkInOpen} animationType="slide" onRequestClose={() => setCheckInOpen(false)}>
            <CheckIn
              state={state}
              colors={colors}
              onClose={() => setCheckInOpen(false)}
              onAppendChat={(m) => update((prev) => ({ ...prev, chat: [...prev.chat, m].slice(-200) }))}
            />
          </Modal>
        </>
      )}

      {celebration && (
        <Celebration
          title={celebration.title}
          subtitle={celebration.subtitle}
          onDone={() => setCelebration(null)}
        />
      )}
      {toast && <Toast key={toast} text={toast} colors={colors} onDone={() => setToast(null)} />}
    </LinearGradient>
  )
}

// Small progress banner: "+1.6% toward 'Write my book' · now 34%"
function Toast({ text, colors, onDone }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.delay(2100),
      Animated.timing(a, { toValue: 0, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
    ]).start(() => onDone?.())
  }, [])
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          backgroundColor: colors.raised,
          borderColor: colors.cyan,
          shadowColor: colors.cyan,
          opacity: a,
          transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        },
      ]}
    >
      <Text style={{ color: colors.cyan, fontWeight: '800', fontSize: 13.5, textAlign: 'center' }}>
        {text}
      </Text>
    </Animated.View>
  )
}

function TabButton({ t, active, colors, onPress }) {
  return (
    <Pressable style={styles.tab} onPress={onPress}>
      <Text style={{ fontSize: 17, color: active ? colors.cyan : colors.inkFaint }}>{t.icon}</Text>
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: '700',
          marginTop: 2,
          letterSpacing: 0.4,
          color: active ? colors.ink : colors.inkFaint,
        }}
      >
        {t.label}
      </Text>
      {active && <View style={[styles.tabDot, { backgroundColor: colors.cyan }]} />}
    </Pressable>
  )
}

// The center orb: bigger than everything, breaking out of the bar.
// The light rings only pulse when Jarvis has something for you (check-in due).
function OrbTab({ active, alert, colors, onPress }) {
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!alert) {
      pulse.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    )
    loop.start()
    return () => loop.stop()
  }, [alert])
  const ringStyle = (delay) => ({
    opacity: pulse.interpolate({
      inputRange: [delay, Math.min(delay + 0.15, 1), 1],
      outputRange: [0, 0.5, 0],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [delay, 1], outputRange: [0.9, 1.65], extrapolate: 'clamp' }),
      },
    ],
  })
  return (
    <View pointerEvents="box-none" style={styles.orbSlot}>
      {[0, 0.35].map((d) => (
        <Animated.View key={d} style={[styles.orbRing, { borderColor: colors.cyan }, ringStyle(d)]} />
      ))}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.orbBtn,
          { borderColor: active ? colors.cyan : colors.lineStrong, backgroundColor: colors.bg },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        <JarvisOrb size={46} intensity={active ? 1 : 0.55} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: 18,
    paddingTop: 10,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  tabDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  orbSlot: {
    position: 'absolute',
    top: -34,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbRing: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
  },
  orbBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  toast: {
    position: 'absolute',
    top: 64,
    left: 24,
    right: 24,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 50,
  },
})
