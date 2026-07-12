import React from 'react'
import { Text, View } from 'react-native'
import { F } from '../tokens'
import { GoldStar } from './StarMark'

// "NORTHST★R" — the logo-sheet wordmark (v23): letterspaced caps that fade
// from starlight white into violet left-to-right, with the faceted gold star
// standing in for the A.
const FADE = ['#f8fafc', '#efe9fd', '#e2d5fc', '#d2bdfa', '#c1a4f8', '#ae8bf6', '#9b73f3', '#8b5cf6', '#7c4ff0']

export default function Wordmark({ text = 'NORTHSTAR', size = 52, width = 340 }) {
  const fs = size * 0.66
  const gap = fs * 0.52
  const letters = text.split('')
  return (
    <View style={{ width, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap }}>
      {letters.map((ch, i) =>
        ch === 'A' ? (
          // Glow variant pads the star inside its box (star = 62.5% of it).
          // 1.28 puts the star's visible height at ~0.8em — optically level
          // with the letters' cap height; the negative margin returns the
          // glow padding to the layout so letter spacing doesn't widen.
          <GoldStar key={i} size={fs * 1.28} glow style={{ marginHorizontal: -(fs * 0.24) }} />
        ) : (
          <Text
            key={i}
            style={{
              fontFamily: F.semibold,
              fontSize: fs,
              color: FADE[Math.min(i, FADE.length - 1)],
              includeFontPadding: false,
            }}
          >
            {ch}
          </Text>
        ),
      )}
    </View>
  )
}
