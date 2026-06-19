import React from 'react'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'

// Soft radial glow — the RN equivalent of CSS radial-gradient ambient light.
// `cx`/`cy` are 0..1 fractions of the box; color fades to transparent by the edge.
export default function Glow({ size = 600, color = '#7c3aed', opacity = 0.18, style }) {
  const id = `g${Math.round(opacity * 1000)}${color.replace('#', '')}`
  return (
    <Svg width={size} height={size} pointerEvents="none" style={[{ position: 'absolute' }, style]}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.7" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  )
}
