import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import JarvisOrb from '../components/JarvisOrb'
import PersonalitySlider from '../components/PersonalitySlider'
import { Card } from '../components/Ui'
import { topStreak } from '../logic'
import { dateKey } from '../storage'
import { catColor } from '../theme'

function greetingFor(hour, name, streak) {
  if (hour < 5) return `The world's asleep, ${name}. Legends aren't.`
  if (hour < 10) return `Suit up, ${name}. The day won't win itself.`
  if (hour < 13) return `Morning: conquered. Momentum: building.`
  if (hour < 17) return streak > 0 ? `${streak} days deep. You're on a heater.` : `Power levels rising, ${name}.`
  if (hour < 21) return `Bring it home, boss.`
  return `Systems check — how was the becoming?`
}

// No-scroll command center: streak → orb → greeting → check-in → top tasks → slider.
export default function Dashboard({ state, colors, onCheckIn, onToggleTask, setPersonality, jarvisLine }) {
  const streak = topStreak(state.streaks)
  const hour = new Date().getHours()
  const fade = useRef(new Animated.Value(0)).current
  const pillPulse = useRef(new Animated.Value(0)).current
  const [showSlider, setShowSlider] = useState(false)

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
    Animated.loop(
      Animated.sequence([
        Animated.timing(pillPulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(pillPulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    ).start()
  }, [])

  // staggered cinematic entrance: each block rises a beat after the last
  const enter = (from, to) => ({
    opacity: fade.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: fade.interpolate({ inputRange: [from, to], outputRange: [16, 0], extrapolate: 'clamp' }) },
    ],
  })

  const today = state.tasks[dateKey()] || []
  const priority = today.filter((t) => t.priority === 'high').slice(0, 3)

  return (
    <View style={styles.fill}>
      {/* streak counter — glowing, breathing */}
      <Animated.View style={[styles.topRow, enter(0, 0.35)]}>
        <Animated.View
          style={[
            styles.streakPill,
            {
              backgroundColor: colors.electricSoft,
              borderColor: pillPulse.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(34,211,238,0.25)', 'rgba(34,211,238,0.9)'],
              }),
              shadowColor: colors.cyan,
              shadowOpacity: pillPulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.6] }),
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 0 },
            },
          ]}
        >
          <Text style={{ color: colors.cyan, fontWeight: '800', fontSize: 14 }}>
            ⚡ {streak} day{streak === 1 ? '' : 's'}
          </Text>
        </Animated.View>
        <Pressable onPress={() => setShowSlider(!showSlider)}>
          <Text style={{ color: colors.inkFaint, fontSize: 13, fontWeight: '600' }}>
            Jarvis: {state.user.jarvisPersonality} ▾
          </Text>
        </Pressable>
      </Animated.View>
      {showSlider && (
        <View style={{ paddingHorizontal: 22, marginTop: 10 }}>
          <PersonalitySlider value={state.user.jarvisPersonality} onChange={setPersonality} colors={colors} />
        </View>
      )}

      {/* orb + greeting */}
      <View style={styles.heroBlock}>
        <Animated.View style={enter(0.1, 0.5)}>
          <JarvisOrb size={130} />
        </Animated.View>
        <Animated.View style={enter(0.3, 0.7)}>
          <Text style={[styles.greeting, { color: colors.ink }]}>
            {greetingFor(hour, state.user.name, streak)}
          </Text>
          <Text style={{ color: colors.inkDim, fontSize: 14, textAlign: 'center', paddingHorizontal: 36, marginTop: 6 }}>
            {jarvisLine}
          </Text>
        </Animated.View>
        <Animated.View style={enter(0.45, 0.85)}>
          <Pressable onPress={onCheckIn} style={({ pressed }) => [pressed && { transform: [{ scale: 0.96 }] }]}>
            <LinearGradient
              colors={colors.accentGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.checkBtn, { shadowColor: colors.electric, shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 4 } }]}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 }}>
                How are you doing?
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>

      {/* today's priorities */}
      <Animated.View style={[{ paddingHorizontal: 22, flex: 1 }, enter(0.6, 1)]}>
        <Card colors={colors} style={{ paddingVertical: 8 }}>
          {priority.length === 0 && (
            <Text style={{ color: colors.inkFaint, fontSize: 13.5, paddingVertical: 10 }}>
              No priority tasks yet — they generate from your accepted goals.
            </Text>
          )}
          {priority.map((t) => (
            <Pressable key={t.id} onPress={() => onToggleTask(t.id)} style={[styles.taskRow, { borderColor: colors.line }]}>
              <View style={[styles.dot, { backgroundColor: catColor(t.category) }]} />
              <Text
                style={{
                  flex: 1,
                  color: t.completed ? colors.inkFaint : colors.ink,
                  fontWeight: '600',
                  fontSize: 14,
                  textDecorationLine: t.completed ? 'line-through' : 'none',
                }}
                numberOfLines={1}
              >
                {t.title}
              </Text>
              <Text style={{ color: t.completed ? colors.success : colors.inkFaint, fontSize: 16 }}>
                {t.completed ? '✓' : '○'}
              </Text>
            </Pressable>
          ))}
        </Card>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  streakPill: { borderWidth: 1, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 14 },
  heroBlock: { alignItems: 'center', marginTop: -6 },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    paddingHorizontal: 30,
    marginTop: -10,
  },
  checkBtn: { borderRadius: 99, paddingVertical: 13, paddingHorizontal: 28, marginTop: 16, marginBottom: 18 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
