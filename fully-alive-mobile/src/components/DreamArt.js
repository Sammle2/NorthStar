import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

// Procedural "dream-life" artwork — a seeded aurora of layered light.
// (Stands in for AI image generation until an image API is connected.)
const PALETTES = [
  ['#0B2B86', '#2E6BFF', '#22D3EE'],
  ['#1E1B4B', '#7C3AED', '#5E8BFF'],
  ['#082F49', '#0EA5E9', '#34D399'],
  ['#172554', '#2E6BFF', '#F472B6'],
]

function rng(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

export default function DreamArt({ seed = 7, height = 220, label }) {
  const rand = rng(seed * 7919)
  const palette = PALETTES[seed % PALETTES.length]
  const orbs = Array.from({ length: 5 }, () => ({
    top: rand() * 70,
    left: rand() * 80,
    size: 70 + rand() * 130,
    color: palette[Math.floor(rand() * palette.length)],
    opacity: 0.25 + rand() * 0.4,
  }))

  return (
    <View style={[styles.frame, { height }]}>
      <LinearGradient colors={[palette[0], '#040918']} style={StyleSheet.absoluteFill} />
      {orbs.map((o, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: `${o.top}%`,
            left: `${o.left}%`,
            width: o.size,
            height: o.size,
            borderRadius: o.size / 2,
            backgroundColor: o.color,
            opacity: o.opacity,
            filter: 'blur(30px)',
          }}
        />
      ))}
      <View style={styles.horizon} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { borderRadius: 18, overflow: 'hidden', justifyContent: 'flex-end' },
  horizon: {
    position: 'absolute',
    bottom: 56,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  label: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    padding: 14,
  },
})
