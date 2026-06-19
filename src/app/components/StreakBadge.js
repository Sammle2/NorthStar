import React, { useEffect, useRef } from 'react'
import { Animated, Text, View } from 'react-native'
import { Flame } from 'lucide-react-native'
import { F } from '../tokens'

// Amber→red pill with a gently pulsing flame. Two sizes: sm (chips) and lg (hero).
export default function StreakBadge({ streak, size = 'sm' }) {
  const isLg = size === 'lg'
  const pulse = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    ).start()
  }, [])
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(245,158,11,0.13)',
        borderWidth: 1,
        borderColor: 'rgba(245,158,11,0.3)',
        paddingVertical: isLg ? 10 : 5,
        paddingHorizontal: isLg ? 20 : 12,
      }}
    >
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Flame size={isLg ? 22 : 15} color="#f59e0b" strokeWidth={2.2} />
      </Animated.View>
      <Text style={{ fontFamily: F.bold, fontSize: isLg ? 20 : 13, color: '#f59e0b' }}>{streak}</Text>
      <Text style={{ fontFamily: F.body, fontSize: isLg ? 14 : 11, color: 'rgba(245,158,11,0.7)' }}>
        {isLg ? 'day streak' : 'days'}
      </Text>
    </View>
  )
}
