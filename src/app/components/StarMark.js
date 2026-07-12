import React from 'react'
import Svg, { Defs, FeGaussianBlur, Filter, Polygon } from 'react-native-svg'

// The NorthStar brand star (logo v23 "glass glow"): a five-point star built
// from 10 flat facets, lit from the upper-left so each arm splits into a
// light/dark pair. Geometry: outer R=48, inner r=22.8, one point up,
// center (50,52) in a 0 0 100 100 viewBox.
const C = [50, 52]
const RIM = [
  [50.0, 4.0], // O0 top
  [63.4, 33.6], // I0
  [95.7, 37.2], // O1
  [71.7, 59.0], // I1
  [78.2, 90.8], // O2
  [50.0, 74.8], // I2
  [21.8, 90.8], // O3
  [28.3, 59.0], // I3
  [4.3, 37.2], // O4
  [36.6, 33.6], // I4
]

// One facet per rim edge, walking clockwise from the top point's left half.
const PURPLE_SHADES = [
  '#a678f8', // top arm, right
  '#9d68f2',
  '#8b52e8', // right arm
  '#8148dd',
  '#7038c8', // bottom-right arm (deepest — shadow side)
  '#7d44d6',
  '#8f58e6', // bottom-left arm
  '#a26cf0',
  '#b989fb', // left arm
  '#cba9ff', // top arm, left (brightest — light side)
]

const GOLD_SHADES = [
  '#f8c84d',
  '#f3b93c',
  '#eba32a',
  '#e0961f',
  '#cf7f14',
  '#d98f1d',
  '#eaa62e',
  '#f0b743',
  '#f9d367',
  '#fce38b',
]

function facets(shades) {
  // Facet k spans rim vertex k → k+1 with the center closing the triangle.
  return RIM.map((v, k) => {
    const next = RIM[(k + 1) % RIM.length]
    return { points: `${C[0]},${C[1]} ${v[0]},${v[1]} ${next[0]},${next[1]}`, fill: shades[k] }
  })
}

export function FacetedStar({ size = 24, shades = PURPLE_SHADES, glow = false }) {
  if (!glow) {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {facets(shades).map((f, i) => (
          <Polygon key={i} points={f.points} fill={f.fill} />
        ))}
      </Svg>
    )
  }
  // Glow variant: the star's own silhouette, Gaussian-blurred and layered
  // under the crisp facets — light radiates outward from every point and edge
  // in the star's shape (not a disc), fading before the avatar's rim.
  const SILHOUETTE = RIM.map((v) => `${v[0]},${v[1]}`).join(' ')
  return (
    <Svg width={size} height={size} viewBox="-30 -28 160 160">
      <Defs>
        <Filter id="bloomWide" x="-80%" y="-80%" width="260%" height="260%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation="12" />
        </Filter>
        <Filter id="bloomMid" x="-60%" y="-60%" width="220%" height="220%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation="6" />
        </Filter>
        <Filter id="bloomTight" x="-40%" y="-40%" width="180%" height="180%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
        </Filter>
      </Defs>
      <Polygon points={SILHOUETTE} fill="#8b5cf6" opacity={0.9} filter="url(#bloomWide)" />
      <Polygon points={SILHOUETTE} fill="#a78bfa" opacity={0.7} filter="url(#bloomMid)" />
      <Polygon points={SILHOUETTE} fill="#d6c7ff" opacity={0.9} filter="url(#bloomTight)" />
      {facets(shades).map((f, i) => (
        <Polygon key={i} points={f.points} fill={f.fill} />
      ))}
    </Svg>
  )
}

// The gold star that stands in for the "A" of the wordmark.
export function GoldStar({ size = 24 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {facets(GOLD_SHADES).map((f, i) => (
        <Polygon key={i} points={f.points} fill={f.fill} />
      ))}
    </Svg>
  )
}

export default FacetedStar
