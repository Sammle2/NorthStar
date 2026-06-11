import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import JarvisOrb from '../components/JarvisOrb'

// Cinematic launch: black → orb ignites → wordmark rises → hand off to the app.
export default function Opening({ onDone, colors }) {
  const orb = useRef(new Animated.Value(0)).current
  const text = useRef(new Animated.Value(0)).current
  const fadeOut = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.sequence([
      Animated.timing(orb, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(text, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.delay(900),
      Animated.timing(fadeOut, { toValue: 0, duration: 600, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
    ]).start(() => onDone())
  }, [])

  return (
    <Animated.View style={[styles.fill, { opacity: fadeOut }]}>
      <LinearGradient colors={colors.bgGrad} style={styles.fill}>
        <View style={styles.center}>
          <Animated.View
            style={{
              opacity: orb,
              transform: [{ scale: orb.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
            }}
          >
            <JarvisOrb size={150} />
          </Animated.View>
          <Animated.View
            style={{
              opacity: text,
              transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
              alignItems: 'center',
            }}
          >
            <Text style={[styles.wordmark, { color: colors.ink }]}>Road Map</Text>
            <Text style={[styles.tag, { color: colors.inkDim }]}>elevate your life</Text>
          </Animated.View>
        </View>
      </LinearGradient>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  wordmark: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  tag: { fontSize: 14, marginTop: 6, letterSpacing: 0.4 },
})
