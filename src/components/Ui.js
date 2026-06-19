import React, { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { fonts } from '../theme'

// The figma look: a hairline amber→violet gradient frame around content.
export function GradientBorder({ colors, radius = 16, style, children }) {
  return (
    <LinearGradient
      colors={colors.triGrad}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius, padding: 1.4 }, style]}
    >
      <View style={{ borderRadius: radius - 1.4, backgroundColor: colors.bg, overflow: 'hidden' }}>
        {children}
      </View>
    </LinearGradient>
  )
}

export function Card({ colors, style, children }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.raised, borderColor: colors.line }, style]}>
      {children}
    </View>
  )
}

export function H1({ colors, children, style }) {
  return <Text style={[styles.h1, { color: colors.ink }, style]}>{children}</Text>
}

export function Kicker({ colors, children, style }) {
  return <Text style={[styles.kicker, { color: colors.inkFaint }, style]}>{children}</Text>
}

export function Btn({ colors, label, onPress, kind = 'primary', style, disabled }) {
  if (kind !== 'primary')
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.btn,
          { borderWidth: 1, borderColor: colors.lineStrong },
          pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
          disabled && { opacity: 0.45 },
          style,
        ]}
      >
        <Text style={{ color: colors.inkDim, fontWeight: '700', fontSize: 14.5 }}>{label}</Text>
      </Pressable>
    )
  // the amber CTA: gradient pill, dark text, warm glow
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }, disabled && { opacity: 0.45 }]}
    >
      <LinearGradient
        colors={colors.primaryGrad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.btn,
          { shadowColor: colors.primary, shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } },
          style,
        ]}
      >
        <Text style={{ color: colors.primaryInk, fontWeight: '800', fontSize: 14.5, letterSpacing: 0.2 }}>
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  )
}

// Glowing progress bar — fill animates in, trailing soft light.
export function GlowBar({ value, color, height = 6, colors }) {
  const w = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(w, { toValue: Math.min(value, 100), duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
  }, [value])
  const tint = color || colors.primary
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          backgroundColor: tint,
          shadowColor: tint,
          shadowOpacity: 0.7,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 18 },
  h1: { fontSize: 26, fontFamily: fonts.display, letterSpacing: 1.2 },
  kicker: {
    fontSize: 10.5,
    fontFamily: fonts.display,
    textTransform: 'uppercase',
    letterSpacing: 2.6,
    marginBottom: 10,
  },
  btn: {
    borderRadius: 99,
    paddingVertical: 14,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
