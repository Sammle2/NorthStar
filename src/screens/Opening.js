import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import JarvisOrb from '../components/JarvisOrb'
import Stars from '../components/Stars'
import { fonts } from '../theme'

// Per-letter color lerp — the wordmark drifts starlight → amber → violet.
function lerpHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return (
    '#' +
    pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
  )
}
function letterColor(stops, t) {
  const seg = t * (stops.length - 1)
  const i = Math.min(Math.floor(seg), stops.length - 2)
  return lerpHex(stops[i], stops[i + 1], seg - i)
}

// Cinematic launch: night sky → orb ignites → gradient wordmark rises → hand off.
export default function Opening({ onDone, colors }) {
  const orb = useRef(new Animated.Value(0)).current
  const text = useRef(new Animated.Value(0)).current
  const fadeOut = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.sequence([
      Animated.timing(orb, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(text, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.delay(1100),
      Animated.timing(fadeOut, { toValue: 0, duration: 600, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
    ]).start(() => onDone())
  }, [])

  const word = 'ROADMAP'

  return (
    <Animated.View style={[styles.fill, { opacity: fadeOut }]}>
      <LinearGradient colors={colors.bgGrad} style={styles.fill}>
        <Stars />
        <View style={styles.center}>
          <Animated.View
            style={{
              opacity: orb,
              transform: [{ scale: orb.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
            }}
          >
            <JarvisOrb size={140} />
          </Animated.View>
          <Animated.View
            style={{
              opacity: text,
              transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
              alignItems: 'center',
            }}
          >
            <View style={[styles.badge, { backgroundColor: colors.violetSoft, borderColor: colors.lineStrong }]}>
              <Text style={{ color: colors.violet, fontSize: 10.5, letterSpacing: 1.8, fontWeight: '600' }}>
                ✦ AI-POWERED LIFE COACHING
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {word.split('').map((ch, i) => (
                <Text
                  key={i}
                  style={[
                    styles.wordmark,
                    {
                      color: letterColor(colors.wordGrad, i / (word.length - 1)),
                      textShadowColor: 'rgba(245,158,11,0.35)',
                      textShadowRadius: 18,
                    },
                  ]}
                >
                  {ch}
                </Text>
              ))}
            </View>
            <Text style={[styles.tag, { color: colors.inkDim }]}>
              Map your dream life. Break it into goals.{'\n'}Live it one day at a time.
            </Text>
          </Animated.View>
        </View>
      </LinearGradient>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  badge: { borderWidth: 1, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 14, marginBottom: 18 },
  wordmark: { fontSize: 44, fontFamily: fonts.displayHeavy, letterSpacing: 5 },
  tag: { fontSize: 14, marginTop: 14, letterSpacing: 0.3, lineHeight: 22, textAlign: 'center' },
})
