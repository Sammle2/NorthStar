import React, { useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'

const STOPS = [
  { key: 'loving', label: 'Loving' },
  { key: 'balanced', label: 'Balanced' },
  { key: 'tough', label: 'Tough' },
]

export default function PersonalitySlider({ value, onChange, colors }) {
  const idx = Math.max(0, STOPS.findIndex((s) => s.key === value))
  const anim = useRef(new Animated.Value(idx)).current

  useEffect(() => {
    Animated.spring(anim, { toValue: idx, useNativeDriver: false, friction: 9 }).start()
  }, [idx])

  const left = anim.interpolate({ inputRange: [0, 2], outputRange: ['0%', '66.666%'] })

  return (
    <View>
      <View style={[styles.track, { backgroundColor: colors.violetSoft, borderColor: colors.line }]}>
        <Animated.View style={[styles.thumb, { left, backgroundColor: colors.violet }]} />
        {STOPS.map((s) => (
          <Pressable key={s.key} style={styles.stop} onPress={() => onChange(s.key)}>
            <Text
              style={{
                color: value === s.key ? '#fff' : colors.inkDim,
                fontWeight: value === s.key ? '700' : '500',
                fontSize: 12.5,
              }}
            >
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 99,
    borderWidth: 1,
    padding: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: '33.333%',
    borderRadius: 99,
  },
  stop: { flex: 1, alignItems: 'center', paddingVertical: 8 },
})
