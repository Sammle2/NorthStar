import React, { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'

// Glowing progress bar — fills from 0 to value with an eased sweep and a soft halo.
export default function GlowProgress({ value, color = '#f59e0b', height = 6, animate = true }) {
  const w = useRef(new Animated.Value(animate ? 0 : value)).current
  useEffect(() => {
    Animated.timing(w, {
      toValue: Math.max(0, Math.min(100, value)),
      duration: 1200,
      useNativeDriver: false,
    }).start()
  }, [value])
  return (
    <View style={{ width: '100%', height, borderRadius: height, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <Animated.View
        style={{
          height,
          borderRadius: height,
          width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.7,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  )
}
