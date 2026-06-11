import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

// A quiet starfield behind everything — the dream-like sky from the mockup.
function rng(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

const rand = rng(42)
const STARS = Array.from({ length: 54 }, (_, i) => ({
  top: rand() * 100,
  left: rand() * 100,
  size: 1 + rand() * 1.8,
  opacity: 0.15 + rand() * 0.5,
  twinkle: i % 5 === 0, // every fifth star breathes
}))

export default function Stars() {
  const t = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(t, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    ).start()
  }, [])
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {STARS.map((s, i) =>
        s.twinkle ? (
          <Animated.View
            key={i}
            style={[
              styles.star,
              {
                top: `${s.top}%`,
                left: `${s.left}%`,
                width: s.size,
                height: s.size,
                opacity: t.interpolate({ inputRange: [0, 1], outputRange: [s.opacity * 0.3, s.opacity + 0.25] }),
              },
            ]}
          />
        ) : (
          <View
            key={i}
            style={[
              styles.star,
              { top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, opacity: s.opacity },
            ]}
          />
        ),
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#DCE2FF' },
})
