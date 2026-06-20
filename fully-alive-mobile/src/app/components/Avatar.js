import React from 'react'
import { Image, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { C, F } from '../tokens'

// Round avatar: shows the uploaded image when present, otherwise a violet gradient
// circle with the person's initials. Used across the social surfaces.
function initialsOf(name, username) {
  const src = (name || username || '?').trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export default function Avatar({ url, name, username, size = 48, ring }) {
  const r = size / 2
  const border = ring ? { borderWidth: 2, borderColor: C.violet } : null
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: r, backgroundColor: C.card, ...border }} />
  }
  return (
    <LinearGradient
      colors={['#7c3aed', '#a78bfa']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center', ...border }}
    >
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.38, color: '#fff', letterSpacing: 0.5 }}>
        {initialsOf(name, username)}
      </Text>
    </LinearGradient>
  )
}
