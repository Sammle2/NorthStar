import React from 'react'
import { View } from 'react-native'
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg'
import { F } from '../tokens'

// "NORTHSTAR" — Cinzel Black with the starlight→amber→violet diagonal gradient,
// rendered via SVG so the gradient paints the glyphs exactly like the Figma wordmark.
export default function Wordmark({ text = 'NORTHSTAR', size = 64, width = 340, color }) {
  const h = size * 1.18
  return (
    <View style={{ width, height: h }}>
      <Svg width={width} height={h}>
        <Defs>
          <LinearGradient id="wordmark" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0.2" stopColor="#f8fafc" />
            <Stop offset="0.6" stopColor="#f59e0b" />
            <Stop offset="1" stopColor="#a78bfa" />
          </LinearGradient>
        </Defs>
        <SvgText
          x={width / 2}
          y={size * 0.86}
          fill={color || 'url(#wordmark)'}
          fontFamily={F.displayBlack}
          fontSize={size}
          fontWeight="900"
          textAnchor="middle"
          letterSpacing={size * 0.1}
        >
          {text}
        </SvgText>
      </Svg>
    </View>
  )
}
