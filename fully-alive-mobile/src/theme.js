// Road Map — electric deep blue, minimal, premium.
export const palettes = {
  dark: {
    bg: '#040918',
    // a touch of violet and deep teal so the night sky has life in it
    bgGrad: ['#06071F', '#0A1238', '#1B1A4E', '#0B2C50'],
    raised: 'rgba(17, 30, 64, 0.72)',
    line: 'rgba(120, 160, 255, 0.14)',
    lineStrong: 'rgba(120, 160, 255, 0.28)',
    ink: '#E8EEFB',
    inkDim: 'rgba(232, 238, 251, 0.6)',
    inkFaint: 'rgba(232, 238, 251, 0.35)',
    electric: '#2E6BFF',
    electricSoft: 'rgba(46, 107, 255, 0.18)',
    glow: '#5E8BFF',
    cyan: '#22D3EE',
    accentGrad: ['#2E6BFF', '#22D3EE'],
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
