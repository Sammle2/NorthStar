// The 5-category life framework — the single source of truth shared by the
// intake, the roadmap (celestial map), Sprints, GoalEditor, and CoachReview.
// Every goal's `category` is one of these five keys.
// (The old MOCK_FRIENDS fixture is gone — the Friends tab is fully Supabase-backed.)

// Ordered for display. `blurb` drives intake copy + goal-generation prompts.
// No emoji/icon — planets are told apart by colour + name + sphere styling.
export const CATEGORIES = [
  { key: 'mind', label: 'Mind', color: '#a78bfa', blurb: 'focus, discipline, learning, creativity, emotional wellbeing' },
  { key: 'body', label: 'Body', color: '#34d399', blurb: 'fitness, energy, nutrition, sleep' },
  { key: 'spirit', label: 'Spirit', color: '#22d3ee', blurb: 'purpose, meaning, peace, faith, mindfulness' },
  { key: 'work', label: 'Work', color: '#f59e0b', blurb: 'career, business, skills, income & finances' },
  { key: 'relationships', label: 'Relationships', color: '#f472b6', blurb: 'family, friends, romance, community' },
]

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key)

export const CATEGORY_COLORS = CATEGORIES.reduce((m, c) => ((m[c.key] = c.color), m), {})
export const CATEGORY_LABELS = CATEGORIES.reduce((m, c) => ((m[c.key] = c.label), m), {})

// Fold any pre-framework goal category (the old 8) onto one of the five, so a
// stray legacy value never lands in the wrong bucket or an empty colour lookup.
export const LEGACY_CATEGORY_MAP = {
  career: 'work',
  wealth: 'work',
  health: 'body',
  relationships: 'relationships',
  mindset: 'mind',
  creative: 'mind',
  travel: 'spirit',
  lifestyle: 'spirit',
}

// Always resolve a goal's stored category to one of the five valid keys.
export function normalizeCategory(cat) {
  const c = (cat || '').toLowerCase()
  if (CATEGORY_COLORS[c]) return c
  if (LEGACY_CATEGORY_MAP[c]) return LEGACY_CATEGORY_MAP[c]
  return 'mind'
}
