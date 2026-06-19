import React, { useEffect, useRef } from 'react'
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native'
import { fonts } from '../theme'

const { width: W, height: H } = Dimensions.get('window')
const SPARK_COLORS = ['#f59e0b', '#a78bfa', '#fbbf24', '#FFFFFF']
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  angle: (i / 18) * Math.PI * 2,
  dist: 110 + (i % 3) * 55,
  size: 5 + (i % 4) * 3,
  color: SPARK_COLORS[i % SPARK_COLORS.length],
}))

// Cinematic achievement overlay: expanding rings + radial particles + title card.
export default function Celebration({ title, subtitle, onDone }) {
  const t = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 2100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => onDone?.())
  }, [])

  const ring = (delay) => ({
    transform: [
      {
        scale: t.interpolate({
          inputRange: [delay, Math.min(delay + 0.6, 1)],
          outputRange: [0.2, 2.6],
          extrapolate: 'clamp',
        }),
      },
    ],
    opacity: t.interpolate({
      inputRange: [delay, delay + 0.1, Math.min(delay + 0.6, 1)],
      outputRange: [0, 0.55, 0],
      extrapolate: 'clamp',
    }),
  })

  const textStyle = {
    opacity: t.interpolate({ inputRange: [0.12, 0.3, 0.85, 1], outputRange: [0, 1, 1, 0] }),
    transform: [
      { scale: t.interpolate({ inputRange: [0.12, 0.35], outputRange: [0.85, 1], extrapolate: 'clamp' }) },
    ],
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlay,
        { opacity: t.interpolate({ inputRange: [0, 0.06, 0.9, 1], outputRange: [0, 1, 1, 0] }) },
      ]}
    >
      {[0, 0.12, 0.24].map((d) => (
        <Animated.View key={d} style={[styles.ring, ring(d)]} />
      ))}
      {PARTICLES.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              backgroundColor: p.color,
              opacity: t.interpolate({ inputRange: [0.1, 0.25, 0.8], outputRange: [0, 1, 0], extrapolate: 'clamp' }),
              transform: [
                { translateX: t.interpolate({ inputRange: [0.1, 0.8], outputRange: [0, Math.cos(p.angle) * p.dist], extrapolate: 'clamp' }) },
                { translateY: t.interpolate({ inputRange: [0.1, 0.8], outputRange: [0, Math.sin(p.angle) * p.dist], extrapolate: 'clamp' }) },
              ],
            },
          ]}
        />
      ))}
      <Animated.View style={[styles.card, textStyle]}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, width: W, height: H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 7, 15, 0.8)',
    zIndex: 100,
  },
  ring: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  particle: { position: 'absolute' },
  card: { alignItems: 'center', paddingHorizontal: 32 },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontFamily: fonts.display,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(232,238,251,0.7)',
    fontSize: 15,
    marginTop: 10,
    textAlign: 'center',
  },
})
