import React, { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Zap } from 'lucide-react-native'
import { C } from '../tokens'

// The Coach: a violet gradient orb with a lightning bolt and a pulsing glow,
// plus a green "online" dot. Matches the Figma header avatar exactly.
export default function CoachAvatar({ size = 44, showStatus = true }) {
  const glow = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1000, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 1000, useNativeDriver: false }),
      ]),
    ).start()
  }, [])
  const dot = Math.round(size * 0.27)
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        shadowColor: C.violet,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: glow.interpolate({ inputRange: [0, 1], outputRange: [6, 14] }),
        shadowOpacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.75] }),
      }}
    >
      <LinearGradient
        colors={[C.violetDeep, C.violet]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
      >
        <Zap size={size * 0.46} color="#fff" strokeWidth={2.4} fill="#fff" />
      </LinearGradient>
      {showStatus && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: C.green,
            borderWidth: 2,
            borderColor: C.bg,
          }}
        />
      )}
    </Animated.View>
  )
}
