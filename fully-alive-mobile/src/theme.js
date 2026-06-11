// Road Map — electric deep blue, minimal, premium.
export const palettes = {
  dark: {
    bg: '#070417',
    // the dream: deep night sky drifting from indigo into violet
    bgGrad: ['#070417', '#0C0A30', '#191250', '#2A1458'],
    raised: 'rgba(26, 22, 64, 0.72)',
    line: 'rgba(150, 140, 255, 0.14)',
    lineStrong: 'rgba(150, 140, 255, 0.28)',
    ink: '#ECEAFB',
    inkDim: 'rgba(236, 234, 251, 0.6)',
    inkFaint: 'rgba(236, 234, 251, 0.35)',
    electric: '#4F6BFF',
    electricSoft: 'rgba(79, 107, 255, 0.18)',
    glow: '#8A9BFF',
    cyan: '#22D3EE',
    violet: '#A78BFA',
    accentGrad: ['#4F6BFF', '#A78BFA'],
    success: '#34D399',
    danger: '#F87171',
    gold: '#FBBF24',
  },
  light: {
    bg: '#EEF3FE',
    bgGrad: ['#F2F5FF', '#E3ECFE', '#E5E0FA', '#D5E8FE'],
    raised: 'rgba(255, 255, 255, 0.85)',
    line: 'rgba(30, 64, 160, 0.12)',
    lineStrong: 'rgba(30, 64, 160, 0.24)',
    ink: '#0A1B40',
    inkDim: 'rgba(10, 27, 64, 0.62)',
    inkFaint: 'rgba(10, 27, 64, 0.38)',
    electric: '#1D4ED8',
    electricSoft: 'rgba(29, 78, 216, 0.12)',
    glow: '#3B82F6',
    cyan: '#0891B2',
    accentGrad: ['#1D4ED8', '#0891B2'],
    success: '#059669',
    danger: '#DC2626',
    gold: '#D97706',
  },
}

export const CATEGORY_COLORS = {
  Business: '#5E8BFF',
  Relationship: '#FB7185',
  Movement: '#34D399',
  Spiritual: '#A78BFA',
  Creativity: '#F472B6',
  Learning: '#FBBF24',
  Lifestyle: '#22D3EE',
  Health: '#4ADE80',
}

export function catColor(category) {
  return CATEGORY_COLORS[category] || '#5E8BFF'
}
