// Road Map — the Figma look: near-black night sky, amber primary, violet coach.
export const palettes = {
  dark: {
    bg: '#07070f',
    // near-black with the faintest violet drift at the horizon
    bgGrad: ['#07070f', '#0a0a18', '#100e26', '#191238'],
    raised: 'rgba(13, 13, 27, 0.82)',
    line: 'rgba(167, 139, 250, 0.12)',
    lineStrong: 'rgba(167, 139, 250, 0.25)',
    ink: '#f1f5f9',
    inkDim: '#94a3b8',
    inkFaint: '#64748b',
    // amber is THE accent: CTAs, streaks, progress, active states
    primary: '#f59e0b',
    primaryDeep: '#d97706',
    primarySoft: 'rgba(245, 158, 11, 0.12)',
    primaryInk: '#07070f', // text on amber
    primaryGrad: ['#f59e0b', '#d97706'],
    // violet is the Coach's color: avatar, bubbles, ambient glow
    violet: '#a78bfa',
    violetDeep: '#7c3aed',
    violetSoft: 'rgba(167, 139, 250, 0.1)',
    coachGrad: ['#7c3aed', '#a78bfa'],
    gold: '#f59e0b', // alias — the path is paved in amber
    // the wordmark: starlight → amber → violet
    wordGrad: ['#f8fafc', '#f59e0b', '#a78bfa'],
    triGrad: ['#f59e0b', '#a78bfa', '#7c3aed'],
    success: '#10b981',
    danger: '#ef4444',
  },
  light: {
    bg: '#faf8f3',
    bgGrad: ['#fdfcf9', '#f7f3ea', '#f1ebf8', '#ece4f6'],
    raised: 'rgba(255, 255, 255, 0.88)',
    line: 'rgba(124, 58, 237, 0.12)',
    lineStrong: 'rgba(124, 58, 237, 0.24)',
    ink: '#1a1230',
    inkDim: 'rgba(26, 18, 48, 0.64)',
    inkFaint: 'rgba(26, 18, 48, 0.4)',
    primary: '#d97706',
    primaryDeep: '#b45309',
    primarySoft: 'rgba(217, 119, 6, 0.12)',
    primaryInk: '#ffffff',
    primaryGrad: ['#f59e0b', '#d97706'],
    violet: '#7c3aed',
    violetDeep: '#5b21b6',
    violetSoft: 'rgba(124, 58, 237, 0.08)',
    coachGrad: ['#5b21b6', '#7c3aed'],
    gold: '#d97706',
    wordGrad: ['#475569', '#d97706', '#7c3aed'],
    triGrad: ['#d97706', '#7c3aed', '#5b21b6'],
    success: '#059669',
    danger: '#dc2626',
  },
}

// Cinematic serif for display text; system sans for body.
export const fonts = {
  display: 'Cinzel_700Bold',
  displayHeavy: 'Cinzel_900Black',
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
