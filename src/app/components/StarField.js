import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'

// Deterministic twinkling starfield — the RN stand-in for the Figma canvas field.
function rng(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

export default function StarField({ count = 90, seed = 7, maxTop = 100 }) {
  const rand = rng(seed)
  const stars = useRef(
    Array.from({ length: count }, (_, i) => ({
      top: rand() * maxTop,
      left: rand() * 100,
      size: 0.6 + rand() * 1.6,
      base: 0.12 + rand() * 0.55,
      twinkle: i % 3 === 0,
      phase: rand(),
    })),
  ).current

  const t = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ]),
    ).start()
  }, [])

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((s, i) => {
        const op = s.twinkle
          ? t.interpolate({ inputRange: [0, 1], outputRange: [s.base * 0.4, s.base] })
          : s.base
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              borderRadius: s.size,
              backgroundColor: '#fff',
              opacity: op,
            }}
          />
        )
      })}
    </View>
  )
}
