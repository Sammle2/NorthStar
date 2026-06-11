import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

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

export function Kicker({ colors, children }) {
  return <Text style={[styles.kicker, { color: colors.inkFaint }]}>{children}</Text>
}

export function Btn({ colors, label, onPress, kind = 'primary', style, disabled }) {
  const isPrimary = kind === 'primary'
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        isPrimary
          ? { backgroundColor: colors.electric }
          : { borderWidth: 1, borderColor: colors.lineStrong },
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      <Text style={{ color: isPrimary ? '#fff' : colors.inkDim, fontWeight: '700', fontSize: 14.5 }}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 18 },
  h1: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  btn: {
    borderRadius: 13,
    paddingVertical: 13,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
