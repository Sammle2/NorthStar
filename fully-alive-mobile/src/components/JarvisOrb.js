import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

// The Jarvis orb — a breathing electric core with a soft outer glow.
export default function JarvisOrb({ size = 140, intensity = 1 }) {
  const pulse = useRef(new Animated.Value(0)).current
  const drift = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    ).start()
    Animated.loop(
      Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: false }),
    ).start()
  }, [])

  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] })
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35 * intensity, 0.7 * intensity] })
  const coreScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] })
  const spin = drift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const spinBack = drift.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] })

  return (
    <View style={{ width: size * 1.6, height: size * 1.6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 1.5,
            height: size * 1.5,
            borderRadius: size,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      {/* arc-reactor HUD rings: two counter-rotating broken arcs */}
      <Animated.View
        style={[
          styles.arc,
          {
            width: size * 1.26,
            height: size * 1.26,
            borderRadius: size,
            borderWidth: 2,
            borderRightColor: 'rgba(34, 211, 238, 0.7)',
            borderBottomColor: 'rgba(34, 211, 238, 0.7)',
            borderLeftColor: 'rgba(34, 211, 238, 0.18)',
            transform: [{ rotate: spin }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.arc,
          {
            width: size * 1.44,
            height: size * 1.44,
            borderRadius: size,
            borderWidth: 1.5,
            borderRightColor: 'rgba(125, 167, 255, 0.45)',
            borderTopColor: 'rgba(125, 167, 255, 0.45)',
            borderBottomColor: 'rgba(125, 167, 255, 0.12)',
            transform: [{ rotate: spinBack }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: coreScale }] }}>
        <LinearGradient
          colors={['#7DA7FF', '#2E6BFF', '#0B2B86']}
          start={{ x: 0.2, y: 0.1 }}
          end={{ x: 0.85, y: 1 }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        >
          {/* inner highlight ring, slowly rotating — gives the orb life */}
          <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, transform: [{ rotate: spin }] }]}>
            <View style={[styles.spark, { top: size * 0.1, left: size * 0.22 }]} />
          </Animated.View>
        </LinearGradient>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    backgroundColor: '#2E6BFF',
    shadowColor: '#5E8BFF',
    shadowOpacity: 0.9,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 0 },
    filter: 'blur(34px)', // web — softens the glow disc into light
  },
  ring: { position: 'absolute' },
  arc: { position: 'absolute', borderColor: 'transparent' },
  spark: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.55)',
    filter: 'blur(8px)',
  },
})
