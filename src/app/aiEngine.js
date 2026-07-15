// The Coach's brain — goal processing, milestone generation, dream-story writing,
// and the Coach's voice across three tones. No external LLM; warm heuristics.

// Capitalize a person's name for display (every word's first letter).
export function capName(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Dream-life survey
// ─────────────────────────────────────────────────────────────────────────────
// Each domain is rated two ways: importanceQ (how much it matters) and
// satisfactionQ (how life delivers on it TODAY). The gap between the two is
// where goals should aim — see leverageAreas below.
export const DREAM_QUESTIONS = [
  {
    key: 'career', emoji: '🚀', label: 'A career or business you’re proud of', short: 'work',
    importanceQ: 'How important is doing work you’re proud of?', satisfactionQ: 'Are you proud of the work you do today?',
  },
  {
    key: 'wealth', emoji: '💎', label: 'Financial freedom and security', short: 'wealth',
    importanceQ: 'How important is being financially free?', satisfactionQ: 'Are you comfortable with your money right now?',
  },
  {
    key: 'health', emoji: '⚡', label: 'A fit, healthy, energized body', short: 'health',
    importanceQ: 'How important is feeling fit and energized?', satisfactionQ: 'Are you happy with your health today?',
  },
  {
    key: 'relationships', emoji: '❤️', label: 'Deep relationships and family', short: 'relationships',
    importanceQ: 'How important are deep bonds and family?', satisfactionQ: 'Are you as close to your people as you want?',
  },
  {
    key: 'creative', emoji: '🎨', label: 'Creating things that matter to you', short: 'creative work',
    importanceQ: 'How important is making things that matter?', satisfactionQ: 'Are you making time to create right now?',
  },
  {
    key: 'travel', emoji: '🌍', label: 'Travel, adventure, new experiences', short: 'adventure',
    importanceQ: 'How important are adventure and new places?', satisfactionQ: 'Are you seeing enough of the world lately?',
  },
  {
    key: 'mindset', emoji: '🧘', label: 'Inner peace, growth, and purpose', short: 'inner growth',
    importanceQ: 'How important are inner peace and purpose?', satisfactionQ: 'Do you feel at peace with where you are?',
  },
  {
    key: 'lifestyle', emoji: '🕊️', label: 'Freedom over your time and life', short: 'lifestyle',
    importanceQ: 'How important is owning your own time?', satisfactionQ: 'Do you feel in control of your time right now?',
  },
]

export const INTEREST_LEVELS = [
  { v: 0, label: 'Not for me' },
  { v: 1, label: 'A little' },
  { v: 2, label: 'A lot' },
  { v: 3, label: "It's everything" },
]
export const MAX_EVERYTHING = 2 // only two domains can be "It's everything"

// Current-state answers for satisfactionQ — stored as profile.dreamSatisfaction
// (parallel map to dreamAnswers: satisfaction[key] = -1 | 0 | 1).
export const SATISFACTION_LEVELS = [
  { v: 1, label: 'Yes' },
  { v: 0, label: 'Neutral' },
  { v: -1, label: 'No' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Two-section intake — "Where I Am" (current reality) and "Where I'm Going"
// (desired future). Every question takes a 1–4 rating plus an optional
// free-text note; together they give the dream reveal the user's reality,
// desired identity, emotional drivers, and constraints. `domain` maps each
// question onto the legacy dream domains so the derived signals keep feeding
// goals, leverage, and focus unchanged.
// ─────────────────────────────────────────────────────────────────────────────
export const CURRENT_LEVELS = [
  { v: 1, label: 'Very low' },
  { v: 2, label: 'Somewhat' },
  { v: 3, label: 'Strong' },
  { v: 4, label: 'Very strong' },
]
export const DESIRE_LEVELS = [
  { v: 1, label: 'Not important' },
  { v: 2, label: 'Somewhat' },
  { v: 3, label: 'Important' },
  { v: 4, label: 'Core desire' },
]
export const CURRENT_QUESTIONS = [
  { key: 'physical', label: 'Physical fitness', domain: 'health' },
  { key: 'emotional', label: 'Emotional wellbeing', domain: 'mindset' },
  { key: 'discipline', label: 'Daily discipline / consistency', domain: 'mindset' },
  { key: 'career', label: 'Career momentum', domain: 'career' },
  { key: 'relationships', label: 'Relationship quality', domain: 'relationships' },
  { key: 'financial', label: 'Financial stability', domain: 'wealth' },
  { key: 'creativity', label: 'Creativity / self-expression', domain: 'creative' },
  { key: 'satisfaction', label: 'Life satisfaction (overall)', domain: 'lifestyle' },
]
export const FUTURE_QUESTIONS = [
  { key: 'physical', label: 'Desired physical state', domain: 'health' },
  { key: 'emotional', label: 'Desired emotional state', domain: 'mindset' },
  { key: 'identity', label: 'Desired identity — who I want to become', domain: 'mindset' },
  { key: 'career', label: 'Desired career outcome', domain: 'career' },
  { key: 'relationships', label: 'Desired relationship outcome', domain: 'relationships' },
  { key: 'financial', label: 'Desired financial outcome', domain: 'wealth' },
  { key: 'creative', label: 'Desired creative expression', domain: 'creative' },
  { key: 'lifestyle', label: 'Desired lifestyle / ideal day', domain: 'lifestyle' },
]

// Fold the two-section intake into the legacy domain maps every consumer
// already reads: answers[domain] = 0..3 (importance), satisfaction[domain] =
// -1 | 0 | 1. Desired ratings drive importance (strongest question wins per
// domain); current ratings drive satisfaction (weakest wins — the
// dissatisfaction is the signal leverage feeds on).
export function deriveDomainSignals(current, future) {
  const answers = {}
  FUTURE_QUESTIONS.forEach((q) => {
    const r = Number(future?.[q.key]?.rating)
    if (!Number.isFinite(r) || r < 1) return
    const v = Math.min(3, Math.max(0, r - 1))
    if (answers[q.domain] === undefined || v > answers[q.domain]) answers[q.domain] = v
  })
  const satisfaction = {}
  CURRENT_QUESTIONS.forEach((q) => {
    const r = Number(current?.[q.key]?.rating)
    if (!Number.isFinite(r) || r < 1) return
    const s = r >= 3 ? 1 : r === 2 ? 0 : -1
    if (satisfaction[q.domain] === undefined || s < satisfaction[q.domain]) satisfaction[q.domain] = s
  })
  return { answers, satisfaction }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leverage = importance × dissatisfaction. The domains that matter a lot AND
// aren't delivering today are where a goal changes the most — the deep-dive
// chat and goal suggestions aim there first.
// ─────────────────────────────────────────────────────────────────────────────
export function leverageAreas(answers, satisfaction, max = 2) {
  const sat = satisfaction || {} // legacy profiles have no satisfaction — treat as neutral
  const entries = DREAM_QUESTIONS.map((q) => {
    const importance = Number(answers?.[q.key]) || 0
    const s = sat[q.key] === -1 || sat[q.key] === 1 ? sat[q.key] : 0
    const score = importance * (s === -1 ? 2 : s === 0 ? 1.2 : 0.5)
    return { key: q.key, label: q.label, short: q.short, importance, satisfaction: s, score }
  })
  const qualified = entries.filter((e) => e.importance >= 2).sort((a, b) => b.score - a.score)
  if (qualified.length) return qualified.slice(0, max)
  // Nothing rated ≥2 — fall back to whatever they care about most.
  return entries.sort((a, b) => b.importance - a.importance).slice(0, max)
}

// Whose life is the dream about? Steers the dream-life story: 'others' centers
// the impact on family/friends/community, 'self' centers personal achievement.
export function dreamFocus(answers, satisfaction) {
  const a = answers || {}
  const s = satisfaction || {}
  const rel = a.relationships || 0
  const career = a.career || 0
  const wealth = a.wealth || 0
  if (rel === 3 || (rel >= 2 && s.relationships === -1 && career <= 2 && wealth <= 2)) return 'others'
  if ((career === 3 || wealth === 3) && rel <= 1) return 'self'
  return 'balanced'
}

// Tappable example goals per domain — specific and measurable, shown on the
// goal step so "make it concrete" never faces a blank page. The DEFAULT list
// covers accounts with no survey signal.
export const GOAL_EXAMPLES = {
  career: ['Land a job I actually love', 'Get promoted this year'],
  wealth: ['Save $10,000', 'Pay off my credit card'],
  health: ['Lose 20 pounds', 'Run a marathon'],
  relationships: ['Weekly one-on-one time with family', 'Rebuild an old friendship'],
  creative: ['Publish my first book', 'Release a song'],
  travel: ['Visit 3 new countries', 'Take a solo trip'],
  mindset: ['Meditate every day for 90 days', 'Journal every morning'],
  lifestyle: ['Cut my week to 40 hours', 'Work from anywhere for a month'],
}
export const GOAL_EXAMPLES_DEFAULT = ['Lose 20 pounds', 'Save $10,000', 'Run a marathon', 'Start a side business']

// ─────────────────────────────────────────────────────────────────────────────
// Typo correction — understand what the user MEANT, not the literal letters.
// "Momney" → "Money". Only corrects tokens close to a known goal word, so real
// words it doesn't recognize are left untouched.
// ─────────────────────────────────────────────────────────────────────────────
const VOCAB = [
  'money', 'wealth', 'rich', 'financial', 'finance', 'freedom', 'income', 'invest', 'investing', 'savings', 'retire', 'debt',
  'business', 'startup', 'company', 'entrepreneur', 'founder', 'product', 'launch', 'revenue', 'clients', 'customers', 'brand', 'career', 'promotion',
  'health', 'healthy', 'fitness', 'gym', 'weight', 'muscle', 'marathon', 'workout', 'strong', 'energy', 'sleep', 'nutrition', 'running',
  'write', 'writing', 'book', 'novel', 'author', 'music', 'film', 'creative', 'create', 'design', 'painting', 'podcast', 'youtube', 'content', 'channel',
  'cook', 'cooking', 'recipe', 'chef', 'kitchen', 'meal', 'bake', 'baking',
  'travel', 'world', 'adventure', 'explore', 'abroad', 'nomad',
  'family', 'children', 'parents', 'relationship', 'partner', 'marriage', 'friends', 'community',
  'peace', 'happy', 'purpose', 'meaning', 'growth', 'learn', 'wisdom', 'mindset', 'spiritual', 'confidence', 'discipline', 'focus', 'meditation', 'journal',
  'lifestyle', 'remote', 'balance', 'flexible',
  'graduate', 'school', 'college', 'degree', 'study', 'essay', 'dream', 'goal', 'build', 'master', 'improve', 'achieve',
  // Legit derivative forms users write as-is — recognized so they're never
  // "corrected", and typos of them correct to the right form (incl. plurals).
  'wealthy', 'save', 'saving', 'client', 'customer', 'parent', 'finances', 'goals', 'books', 'meals', 'dreams',
]
const VOCAB_SET = new Set(VOCAB)

// Real English words that sit one or two edits from a vocab word ("lunch"→launch,
// "journey"→journal, "monkey"→money, "books"→book…). The corrector must NEVER
// rewrite these — a wrong "fix" mangles the user's own goal text, which is far
// worse than leaving a typo alone. Includes everyday words as extra safety.
const COMMON_NEIGHBORS =
  ('monkey honey brook navel gravel fiend coals goats goat cream yearn built mister approve stealth stealthy ' +
   'saying lunch grand produce contest context resign explode chicken painter printer mediation journey remove ' +
   'sturdy kingdom colleague morning ruining witness fatness romance revenge propose decree invent string wrong ' +
   'steep sheep sleek weigh height place slave salve sailing customs patent mouth month months weekly daily ' +
   'about above after again might right think thing would could should where which while their there these ' +
   'those other every first house water small large sound still being never under great worth wrote')
const COMMON_WORDS = new Set(COMMON_NEIGHBORS.split(/\s+/).filter(Boolean))

// Inflected forms of every recognized word (plurals, -ing, -ed, -er…) are real
// words the user meant as written — "books" must never be singularized to "book".
// Over-generating here is harmless: entries only ever SKIP correction.
const INFLECTED = (() => {
  const set = new Set()
  const addForms = (w) => {
    set.add(w + 's'); set.add(w + 'es')
    set.add(w + 'ed'); set.add(w + 'ing')
    set.add(w + 'er'); set.add(w + 'ers')
    if (w.endsWith('e')) {
      const stem = w.slice(0, -1)
      set.add(stem + 'ing'); set.add(w + 'd'); set.add(stem + 'er'); set.add(stem + 'ers')
    }
    if (w.endsWith('y')) {
      const stem = w.slice(0, -1)
      set.add(stem + 'ies'); set.add(stem + 'ied'); set.add(stem + 'ier')
    }
    // Final-consonant doubling (run→running, plan→planned).
    const last = w[w.length - 1]
    if (/[bdgklmnprt]/.test(last) && /[aeiou]/.test(w[w.length - 2] || '')) {
      set.add(w + last + 'ing'); set.add(w + last + 'ed'); set.add(w + last + 'er')
    }
  }
  VOCAB.forEach(addForms)
  COMMON_WORDS.forEach(addForms)
  return set
})()

// Damerau-Levenshtein (optimal string alignment): adjacent transpositions —
// the most common typo, e.g. "novle"→"novel" — count as a single edit.
function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1)
      }
    }
  }
  return dp[m][n]
}

function correctToken(tok) {
  const lower = tok.toLowerCase()
  // Tokens under 5 letters have too many real-word neighbors (cool/look/took…) —
  // never correct them. Recognized words and their inflections pass through as-is.
  if (lower.length < 5 || /\d/.test(lower)) return tok
  if (VOCAB_SET.has(lower) || INFLECTED.has(lower) || COMMON_WORDS.has(lower)) return tok
  // Corrections must be confident: 1 edit for 5–6 letter words, 2 only for 7+.
  const maxD = lower.length <= 6 ? 1 : 2
  let best = null, bestD = 99
  for (const w of VOCAB) {
    if (Math.abs(w.length - lower.length) > maxD) continue
    const d = levenshtein(lower, w)
    if (d < bestD) { bestD = d; best = w }
  }
  if (best && bestD <= maxD && bestD < lower.length) {
    return /^[A-Z]/.test(tok) ? best[0].toUpperCase() + best.slice(1) : best
  }
  return tok
}

export function correctTypos(text) {
  return (text || '')
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part) || !part) return part
      const m = part.match(/^([^\w]*)([\w'-]*)([^\w]*)$/)
      if (!m || !m[2]) return part
      return m[1] + correctToken(m[2]) + m[3]
    })
    .join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme detection
// ─────────────────────────────────────────────────────────────────────────────
const detectThemes = (text) => {
  const lower = correctTypos(text || '').toLowerCase()
  return {
    career: /business|startup|company|entrepreneur|founder|product|launch|revenue|clients|customers|agency|brand|career|job|promotion|role/.test(lower),
    health: /health|fit|gym|body|weight|lose|run|marathon|workout|strong|energy|sleep|nutrition|muscle/.test(lower),
    wealth: /money|rich|wealth|financial|invest|passive|income|freedom|retire|savings|crypto|stocks|debt/.test(lower),
    creative: /write|book|novel|art|music|film|creative|create|design|paint|podcast|youtube|content|channel/.test(lower),
    travel: /travel|world|countries|adventure|abroad|nomad|explore|trip|visit/.test(lower),
    relationships: /family|kids|children|parents|relationship|partner|marry|love|friends|community/.test(lower),
    mindset: /peace|happy|purpose|meaning|grow|learn|wisdom|mind|soul|spiritual|confidence|discipline|focus/.test(lower),
    lifestyle: /freedom|lifestyle|remote|time|balance|own terms|flexible/.test(lower),
  }
}

const primaryThemeOf = (text) => {
  const t = detectThemes(text)
  const order = ['career', 'wealth', 'health', 'creative', 'travel', 'relationships', 'lifestyle', 'mindset']
  return order.find((k) => t[k]) || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Goal validation + actionable renaming
// ─────────────────────────────────────────────────────────────────────────────
const UNATTAINABLE = [
  { re: /\b(taller|shorter|height)\b|grow.{0,14}(inch|inches|cm|feet|tall)/i, what: 'change your height' },
  { re: /\b(younger|turn back time|reverse ag(e|ing)|be a kid again|unage)\b/i, what: 'reverse your age' },
  { re: /\b(immortal|live forever|never die|undying)\b/i, what: 'live forever' },
  { re: /\b(teleport|superpower|super power|fly like|read minds|magic powers)\b/i, what: 'gain superpowers' },
  { re: /\b(change my past|undo the past|different person entirely|be someone else)\b/i, what: 'change the past' },
]

// One general sentence Nova remembers about each goal — derived fresh from the
// profile every time, so it always matches this account's goals (including the
// goal from the intake form, goals Nova added in chat, edits, and progress).
// These are PERMANENT memory: clearing chat memories never touches them, and
// Nova's coaching rules live in its prompt, so neither can be wiped.
export function goalMemories(profile) {
  const first = (profile?.name || 'They').split(' ')[0]
  return (profile?.goals || []).map((g) => {
    const pct = Math.round(g.progress || 0)
    const status = pct >= 100 ? 'achieved it' : pct > 0 ? `${pct}% of the way there` : 'just getting started'
    return `${first} is working toward “${g.title}” — ${status}.`
  })
}

// Throwaway non-answers the goal gate must never accept, no matter the attempt.
const NON_ANSWERS = new Set([
  'idk', 'dunno', 'nothing', 'none', 'whatever', 'anything', 'something', 'stuff', 'things',
  'test', 'testing', 'asdf', 'qwerty', 'blah', 'na', 'n/a', 'no', 'yes', 'ok', 'okay', 'sure',
  'lol', 'haha', 'hmm', 'huh', 'what', 'you', 'me', 'goal', 'goals', 'dream', 'dreams',
])

export function validateGoal(raw) {
  const s = (raw || '').trim()
  const hit = UNATTAINABLE.find((u) => u.re.test(s))
  if (hit) {
    return {
      ok: false,
      what: hit.what,
      clarify: `I can't map a path to "${hit.what}" — that's outside what daily action can change. But there's almost always a real goal underneath it. What are you actually after? (more confidence, presence, respect, peace?) Tell me that.`,
    }
  }
  if (s.length < 3) {
    return { ok: false, what: 'that', clarify: "Give me a little more to work with — what's the goal, in a sentence?" }
  }
  // Local gibberish gate — catches keysmash and non-answers even when the AI judge
  // is unreachable (it fails open), so the gate never waves garbage through.
  const lower = s.toLowerCase()
  const letters = lower.replace(/[^a-z]/g, '')
  const oneWord = !/\s/.test(lower)
  if (oneWord && NON_ANSWERS.has(lower.replace(/[^a-z/]/g, ''))) {
    return { ok: false, what: 'that', clarify: "That's a placeholder, not a goal. What's the ONE thing you actually want to achieve? Name it — a business, a body, a skill, a number." }
  }
  if (letters.length >= 4 && !/[aeiouy]/.test(letters)) {
    return { ok: false, what: 'that', clarify: "That doesn't read as a real goal to me. Give it to me straight — what do you want to achieve, in plain words?" }
  }
  if (letters.length >= 4 && /^(.)\1+$/.test(letters)) {
    return { ok: false, what: 'that', clarify: "Try again for real this time — what's the one goal that would change things for you?" }
  }
  return { ok: true }
}

const TITLE_STOPWORDS = new Set(['the', 'a', 'an', 'to', 'my', 'of', 'and', 'or', 'for', 'in', 'on', 'at', 'by'])

export function actionableTitle(raw) {
  let s = (raw || '').trim().replace(/[.!?]+$/, '')
  s = s.replace(/^(i\s+(really\s+)?(want|wanna|need|hope|wish|would like|'d like|aim|plan)\s+(to\s+)?|my\s+(goal|dream|aim)\s+is\s+(to\s+)?|i\s+want\b\s*)/i, '')
  s = s.replace(/^(to|that i|i)\s+/i, '')
  s = correctTypos(s) // understand what they meant — fix "Momney" → "Money"
  if (!s) return 'Your Primary Goal'
  s = s.replace(/^be(come)?\s+/i, 'Become ')
  const titled = s
    .split(/\s+/)
    .map((w, i) => {
      const lw = w.toLowerCase()
      if (i > 0 && TITLE_STOPWORDS.has(lw)) return lw
      if (/^\d/.test(w)) return w
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
  return titled.charAt(0).toUpperCase() + titled.slice(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestones (≥6 per goal, specific + actionable) + goal generation
// ─────────────────────────────────────────────────────────────────────────────
const DATES = ['Week 2', 'Month 1', 'Month 3', 'Month 6', 'Month 9', 'Year 1', 'Year 2']
function mkMilestones(titles) {
  return titles.map((t, i) => ({ id: `m${i + 1}`, title: t, completed: false, targetDate: DATES[i] || 'The summit' }))
}
function mkActions(list) {
  return list.map((t, i) => ({ id: `a${i + 1}`, title: t, completed: false, streak: 0 }))
}

// Each goal climbs through THREE timed milestones (3 / 6 / 12 months). Every
// milestone carries "stepping stones" — the day-to-day actions that get you
// there. Titles imply concrete targets; the user can edit them all in Redo.
const THEME_ROADMAP = {
  career: {
    m3: { title: 'Define your offer and land your first win', steps: ['Get crystal clear on what you offer', 'Identify exactly who it’s for', 'Land your first small win'] },
    m6: { title: 'Build consistent, referable traction', steps: ['Create a repeatable system', 'Reach steady weekly output', 'Get referred by someone'] },
    m12: { title: 'Step into the role or income you want', steps: ['Raise your rates or scope', 'Become known in your space', 'Hit your target number'] },
  },
  wealth: {
    m3: { title: 'Publish your idea / first income source', steps: ['Map your numbers and target', 'Come up with the idea', 'Launch or publish it'] },
    m6: { title: 'Reach your first real traction', steps: ['Get your first paying users', 'Reach $500 outside your job', 'Reinvest your first profits'] },
    m12: { title: 'Hit $5k/month (or your number)', steps: ['Scale what’s working', 'Automate saving & investing', 'Reach your monthly target'] },
  },
  health: {
    m3: { title: 'Lock in the routine', steps: ['Move 4× every week', 'Fix your sleep schedule', 'Clean up one eating habit'] },
    m6: { title: 'See real, visible change', steps: ['Hit a strength/endurance mark', 'Reach a visible body change', 'Sustain it for 90 days'] },
    m12: { title: 'Live in the body you want', steps: ['Make it identity, not effort', 'Hit your goal composition', 'Inspire someone else'] },
  },
  creative: {
    m3: { title: 'Find your voice and publish', steps: ['Define your niche & format', 'Publish your first 10 pieces', 'Get your first real feedback'] },
    m6: { title: 'Build a small, real audience', steps: ['Publish consistently for 90 days', 'Reach your first 100 fans', 'Make one signature piece'] },
    m12: { title: 'Make your creative work pay', steps: ['Grow to 1,000+ followers', 'Earn your first income from it', 'Land a standout collaboration'] },
  },
  travel: {
    m3: { title: 'Plan and book the first trip', steps: ['Pick your destinations', 'Set the budget & start saving', 'Book the first trip'] },
    m6: { title: 'Take the leap', steps: ['Go on the first real trip', 'Stretch further / go solo', 'Document and share it'] },
    m12: { title: 'Make travel a way of life', steps: ['Plan a longer stay abroad', 'Build location-flexible income', 'Make exploring routine'] },
  },
  relationships: {
    m3: { title: 'Show up consistently', steps: ['Name who matters most', 'Start a weekly ritual', 'Reach out with no agenda'] },
    m6: { title: 'Deepen the key bonds', steps: ['Have the honest conversation', 'Repair or grow one bond', 'Be the one others rely on'] },
    m12: { title: 'Build the circle you want', steps: ['Gather people regularly', 'Let go of a draining tie', 'Feel genuinely supported'] },
  },
  mindset: {
    m3: { title: 'Build the daily base', steps: ['Start a daily grounding habit', 'Read one growth book', 'Cut your biggest source of noise'] },
    m6: { title: 'Strengthen your focus', steps: ['Hold focus under pressure', 'Journal for 90 days', 'Sit calmly with discomfort'] },
    m12: { title: 'Live with steady peace', steps: ['Make calm your default', 'Mentor someone through it', 'Feel clear on your why'] },
  },
  lifestyle: {
    m3: { title: 'Audit and cut', steps: ['Track where your time goes', 'Cut your biggest time drain', 'Protect one deep-work block'] },
    m6: { title: 'Build the systems', steps: ['Automate or delegate one thing', 'Set boundaries that stick', 'Design your ideal week'] },
    m12: { title: 'Live on your own terms', steps: ['Own your schedule', 'Work from anywhere', 'Repeat a week you love'] },
  },
}

const HORIZONS = ['3 months', '6 months', '12 months']

export function horizonToMonths(h) {
  const s = String(h || '').toLowerCase()
  const num = parseFloat((s.match(/(\d+(?:\.\d+)?)/) || [])[1])
  if (!num || !Number.isFinite(num)) return null
  if (s.includes('week')) return num / 4.345
  if (s.includes('day')) return num / 30.44
  if (s.includes('year')) return num * 12
  return num // bare numbers and "months" both read as months
}

// How long a goal actually runs, in months: the explicit timeframeMonths when
// present, else parsed from the FINAL milestone's horizon label (legacy goals
// predate the field), else 12. Clamped to the 1–24 month window the roadmap
// timeline displays.
export function goalDurationMonths(goal) {
  const tf = Math.round(Number(goal?.timeframeMonths))
  if (Number.isFinite(tf) && tf >= 1) return Math.min(24, tf)
  const ms = goal?.milestones || []
  const m = horizonToMonths(ms[ms.length - 1]?.horizon)
  if (m == null) return 12
  return Math.min(24, Math.max(1, Math.round(m)))
}

// Compact 2-3 word name for a stepping stone, shown on the roadmap path (the
// full title lives in the tap-to-expand dropdown). Used as the fallback when a
// step has no AI-provided label — first word (the verb) + next meaningful words.
const STEP_STOPWORDS = new Set([
  'a', 'an', 'the', 'your', 'my', 'our', 'their', 'to', 'for', 'of', 'in', 'on', 'at',
  'with', 'and', 'or', 'that', 'this', 'it', 'is', 'be', 'by', 'up', 'out', 'from',
  'least', 'each', 'every', 'per', 'one', 'two', 'three', 'least',
])
export function shortStepLabel(title) {
  // Split on clause boundaries only — ", " (with a space) not bare commas, so
  // numbers like "$1,200" survive intact.
  const words = String(title || '').split(/[—–(]|,\s/)[0].split(/\s+/).filter(Boolean)
  const keep = []
  for (const w of words) {
    const clean = w.replace(/[^\w$%',./-]/g, '').replace(/[,.]+$/, '')
    if (!clean) continue
    if (keep.length && STEP_STOPWORDS.has(clean.toLowerCase())) continue // always keep the leading verb
    keep.push(clean)
    if (keep.length === 3) break
  }
  return keep.join(' ') || 'Step'
}

// Steps may arrive as plain strings (local templates, legacy data) or as
// { label, detail } objects from the AI roadmap. Either way the stored shape is
// { id, title: <full detail>, label: <2-3 words>, completed }.
function mkSteps(arr) {
  return arr.map((t, i) => {
    if (t && typeof t === 'object') {
      const detail = String(t.detail || t.title || '').trim() || 'Take the next step'
      const label = String(t.label || '').trim() || shortStepLabel(detail)
      return { id: `s${i + 1}`, title: detail, label, completed: false }
    }
    const title = String(t)
    return { id: `s${i + 1}`, title, label: shortStepLabel(title), completed: false }
  })
}
function defaultRoadmap(title) {
  return {
    m3: { title: `Lay the groundwork for "${title}"`, steps: ['Get crystal clear on what it takes', 'Break it into weekly targets', 'Take the first real step'] },
    m6: { title: 'Hit your first real proof point', steps: ['Build a consistent routine', 'Reach the halfway mark', 'Push through the hard part'] },
    m12: { title: `Achieve it: ${title}`, steps: ['Sustain the momentum', 'Close the final gap', 'Make it real'] },
  }
}

// Three timed milestones (3/6/12mo), each with its stepping stones.
function buildMilestones(theme, title, isPrimary) {
  const tr = (theme && THEME_ROADMAP[theme]) || defaultRoadmap(title)
  const defs = [tr.m3, tr.m6, tr.m12]
  return defs.map((d, i) => ({
    id: `ms-${[3, 6, 12][i]}`,
    horizon: HORIZONS[i],
    title: isPrimary && i === 2 ? `Achieve it: ${title}` : d.title,
    completed: false,
    steps: mkSteps(d.steps),
  }))
}

// Roll up milestone + stepping-stone completion into a goal's progress, and
// auto-complete a milestone once all its stepping stones are done.
export function recomputeGoal(goal) {
  const milestones = goal.milestones.map((m) => {
    const steps = m.steps || []
    const completed = steps.length ? steps.every((s) => s.completed) : !!m.completed
    return { ...m, completed }
  })
  let total = 0,
    done = 0
  milestones.forEach((m) => {
    const steps = m.steps || []
    total += steps.length + 1
    done += steps.filter((s) => s.completed).length + (m.completed ? 1 : 0)
  })
  return { ...goal, milestones, progress: total ? Math.round((done / total) * 100) : 0 }
}

const DOMAIN_TEMPLATES = {
  career: {
    title: 'Build a Career You’re Proud Of',
    category: 'career',
    summit: 'Step into the role or income you set as the target',
    dailyActions: ['Two focused hours on the real work', 'Sharpen one skill that matters', 'Make one meaningful connection'],
  },
  wealth: {
    title: 'Reach Financial Freedom',
    category: 'wealth',
    summit: 'Reach your financial freedom number',
    dailyActions: ['Track every dollar today', 'Grow your earning power 1%', 'Move one money task forward'],
  },
  health: {
    title: 'Transform My Health & Energy',
    category: 'health',
    summit: 'Reach the body and energy you set out for',
    dailyActions: ['Move your body 30 minutes', 'Eat to fuel, not to numb', 'In bed by your target time'],
  },
  relationships: {
    title: 'Build Deeper Relationships',
    category: 'relationships',
    summit: 'Build the circle you’ve always wanted',
    dailyActions: ['Reach out to someone you love', 'Be fully present once today', 'Do one quiet kind thing'],
  },
  creative: {
    title: 'Build My Creative Platform',
    category: 'creative',
    summit: 'Make your creative work self-sustaining',
    dailyActions: ['Create for 60 minutes', 'Share something, even if small', 'Study a creator you admire'],
  },
  travel: {
    title: 'Live a Life of Adventure',
    category: 'travel',
    summit: 'Make travel a recurring part of life',
    dailyActions: ['Plan or research one adventure', 'Set money aside for the trip', 'Learn about a new place'],
  },
  mindset: {
    title: 'Master My Mindset & Focus',
    category: 'mindset',
    summit: 'Live with steady, grounded peace',
    dailyActions: ['10 minutes of stillness', 'Journal before bed', 'Read 20 pages that grow you'],
  },
  lifestyle: {
    title: 'Design My Ideal Lifestyle',
    category: 'lifestyle',
    summit: 'Live fully on your own terms',
    dailyActions: ['Protect your deep-work hours', 'Eliminate one time-waster', 'Design tomorrow tonight'],
  },
}

// The generic domain-template goal titles. A supporting goal carrying one of
// these still needs a specific, user-grounded title — it must never be shown to
// the user as-is (generic goals deter people from the app).
export const GENERIC_GOAL_TITLES = new Set(Object.values(DOMAIN_TEMPLATES).map((t) => t.title))
export function isGenericGoalTitle(title) {
  return GENERIC_GOAL_TITLES.has(String(title || '').trim())
}

// Build a supporting goal from an AI-generated SPECIFIC { title, category }. It's
// a source:'template' scaffold with placeholder milestones so the background
// upgrader fills in a full specific roadmap — but the TITLE is already specific,
// so the roadmap never shows a generic goal, even for the moment before upgrade.
export function buildSupportingGoal(title, category, id = `goal-${Math.random().toString(36).slice(2, 8)}`) {
  const clean = String(title || '').trim()
  const cat = VALID_CATEGORIES.has(category) ? category : primaryThemeOf(clean) || 'mindset'
  const tmpl = DOMAIN_TEMPLATES[cat]
  return {
    id,
    title: clean,
    category: cat,
    progress: 0,
    timeframeMonths: 12,
    source: 'template',
    milestones: buildMilestones(cat, clean, false),
    dailyActions: mkActions(tmpl ? tmpl.dailyActions : ['Take one real step toward your goal', 'Remove one obstacle in your way', 'Reflect on what moved the needle']),
  }
}

// Three timed milestones (+ stepping stones) for a supporting (survey) goal.
function domainMilestones(domain) {
  return buildMilestones(domain, DOMAIN_TEMPLATES[domain].title, false)
}

// Build a goal from raw user text — actionable title + 3 timed milestones, each
// with stepping stones, flavored by its theme. Reused for the onboarding primary
// goal AND for new goals spun up from Sprints.
export function buildGoal(rawGoal, extra = '', id = `goal-${Math.random().toString(36).slice(2, 8)}`) {
  const title = actionableTitle(rawGoal)
  const theme = primaryThemeOf(rawGoal + ' ' + (extra || ''))
  const tmpl = theme && DOMAIN_TEMPLATES[theme]
  const milestones = buildMilestones(theme, title, true)
  const actions = tmpl ? tmpl.dailyActions : ['Take one real step toward your goal', 'Remove one obstacle in your way', 'Reflect on what moved the needle']
  // source:'template' marks this as a local scaffold — the app upgrades untouched
  // template goals to goal-specific AI roadmaps in the background (App.js).
  // timeframeMonths: goals default to a 12-month arc; readers treat missing as 12.
  return { id, title, category: tmpl ? tmpl.category : 'mindset', progress: 0, timeframeMonths: 12, source: 'template', milestones, dailyActions: mkActions(actions) }
}

// Regenerate the milestones (+ stepping stones) for a goal title — the "redo" /
// AI-assist flow when the user doesn't know what their milestones should be.
export function regenerateMilestones(goalTitle, extra = '') {
  const theme = primaryThemeOf(goalTitle + ' ' + (extra || ''))
  return buildMilestones(theme, actionableTitle(goalTitle), true)
}

const VALID_CATEGORIES = new Set(Object.keys(DOMAIN_TEMPLATES))

// Turn a Claude-generated roadmap (loose JSON) into a goal in the app's exact
// shape. Tolerant of missing/odd fields — anything unusable falls back to the
// local template via buildGoal, so onboarding never breaks on a bad response.
export function normalizeAiGoal(ai, rawGoal, extra = '', id = 'goal-primary') {
  if (!ai || !Array.isArray(ai.milestones) || ai.milestones.length === 0) {
    return buildGoal(rawGoal, extra, id)
  }
  const title = (ai.title && String(ai.title).trim()) || actionableTitle(rawGoal)
  const category = VALID_CATEGORIES.has(ai.category)
    ? ai.category
    : primaryThemeOf(`${rawGoal} ${extra}`) || 'mindset'

  // The AI picks the shortest realistic total timeframe for this goal —
  // clamp to a sane 1–24 month window, default anything unusable to 12.
  const tfRaw = Math.round(Number(ai.timeframeMonths))
  const tf = Number.isFinite(tfRaw) ? Math.min(24, Math.max(1, tfRaw)) : 12

  // Keep the engine's id/horizon scheme so Roadmap renders identically.
  const milestones = ai.milestones.slice(0, 3).map((m, i) => {
    const steps = (Array.isArray(m.steps) ? m.steps : [])
      .map((s) => {
        if (typeof s === 'string') return s.trim() ? s : null
        if (s && typeof s === 'object' && (s.detail || s.title)) return { label: s.label, detail: s.detail || s.title }
        return null
      })
      .filter(Boolean)
    return {
      id: `ms-${[3, 6, 12][i] || i + 1}`,
      // Prefer the AI's horizon label — it adapts to the user's own deadline
      // ("6 weeks" for a 6-month goal). Fall back to the engine's 3/6/12 scheme.
      horizon: (m.horizon && String(m.horizon).trim()) || HORIZONS[i] || 'The summit',
      title: (m.title && String(m.title).trim()) || `Milestone ${i + 1}`,
      completed: false,
      steps: mkSteps(steps.length ? steps : ['Take the first real step']),
    }
  })

  const daily = (Array.isArray(ai.dailyActions) ? ai.dailyActions : [])
    .map((a) => (typeof a === 'string' ? a : a?.title))
    .filter((t) => t && String(t).trim())
  const dailyActions = mkActions(
    daily.length ? daily : ['Take one real step toward your goal', 'Remove one obstacle in your way', 'Reflect on what moved the needle'],
  )

  return { id, title, category, progress: 0, timeframeMonths: tf, source: 'ai', milestones, dailyActions }
}

const buildPrimaryGoal = (rawGoal, extra) => buildGoal(rawGoal, extra, 'goal-primary')

export function generateGoals(rawGoal, answers, extra) {
  const goals = [buildPrimaryGoal(rawGoal, extra)]
  const primaryTheme = goals[0].category

  const ranked = Object.entries(answers || {})
    .filter(([k, v]) => v >= 2 && k !== primaryTheme)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)

  for (const domain of ranked) {
    if (goals.length >= 3) break
    const tmpl = DOMAIN_TEMPLATES[domain]
    if (!tmpl) continue
    goals.push({ id: `goal-${domain}`, title: tmpl.title, category: tmpl.category, progress: 0, timeframeMonths: 12, milestones: domainMilestones(domain), dailyActions: mkActions(tmpl.dailyActions) })
  }

  if (goals.length === 1) {
    const d = primaryTheme === 'mindset' ? 'health' : 'mindset'
    const tmpl = DOMAIN_TEMPLATES[d]
    goals.push({ id: 'goal-support', title: tmpl.title, category: tmpl.category, progress: 0, timeframeMonths: 12, milestones: domainMilestones(d), dailyActions: mkActions(tmpl.dailyActions) })
  }
  return goals
}

// ─────────────────────────────────────────────────────────────────────────────
// Today's three non-negotiables — small, do-it-now keystone actions.
// ─────────────────────────────────────────────────────────────────────────────
const UNIVERSAL_NN = [
  'Write down your #1 priority for today',
  'Take one real step toward your biggest goal',
  'Spend 5 minutes in focused stillness',
  'Move your body for 10 minutes',
  'Reach out to one person who matters',
]

// Each non-negotiable is anchored to a time of day. Defaults are morning / midday
// / evening; the user can change any of them on the home screen.
const NN_DEFAULT_TIMES = ['8:00 AM', '1:00 PM', '8:00 PM']
export const NN_TIME_OPTIONS = [
  '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '12:00 PM',
  '1:00 PM', '3:00 PM', '5:00 PM', '6:00 PM', '8:00 PM', '9:00 PM', '10:00 PM',
]

// A task reads best at a time that fits it — "journal before bed" belongs in
// the evening, "eat a real breakfast" in the morning — so anchor each task to a
// time by its wording rather than just its slot position. Ordered most- to
// least-specific (meal / bed anchors before softer activity cues) and first
// match wins, so "make your bed" reads as morning, not bedtime. Every time is
// one of NN_TIME_OPTIONS so the home-screen picker highlights the match.
const NN_TIME_RULES = [
  ['8:00 AM', /\b(morning|wake|sunrise|breakfast|first thing|make (?:your|the) bed|cold shower)\b/],
  ['12:00 PM', /\b(lunch|midday|noon)\b/],
  ['6:00 PM', /\bdinner\b/],
  ['8:00 PM', /\b(before bed|bedtime|bed|asleep|sleep|tonight|evening|night|wind down|unwind)\b/],
  ['8:00 AM', /\b(meditat\w*|stillness|mindful\w*|breathe|breathing|affirmation|visuali[sz]e|intention|plan (?:your|the|out) day|priorit(?:y|ies) for (?:today|the day))\b/],
  ['8:00 PM', /\b(journal\w*|reflect\w*|gratitude|review (?:your|the) day|prepare for tomorrow|plan (?:for )?tomorrow)\b/],
  ['6:00 PM', /\b(workout|exercise|gym|training|train|run|running|jog\w*|walk\w*|move your body|yoga|stretch\w*)\b/],
]

// Infer a fitting time of day from a task's wording; null when nothing matches.
export function inferTaskTime(title) {
  const t = (title || '').toLowerCase()
  for (const [time, re] of NN_TIME_RULES) if (re.test(t)) return time
  return null
}

export function generateNonNegotiables(profile) {
  // Rotate through each goal's daily actions by calendar day, so today's three
  // tasks stay specific to the goals AND vary day to day instead of repeating
  // the first action forever.
  const now = new Date()
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)
  const fromGoals = (profile.goals || [])
    .map((g, gi) => {
      const acts = (g.dailyActions || []).map((a) => a?.title).filter(Boolean)
      return acts.length ? acts[(dayOfYear + gi) % acts.length] : null
    })
    .filter(Boolean)
  const picked = []
  for (const t of fromGoals) {
    if (picked.length >= 3) break
    if (!picked.includes(t)) picked.push(t)
  }
  for (const t of UNIVERSAL_NN) {
    if (picked.length >= 3) break
    if (!picked.includes(t)) picked.push(t)
  }
  // Give each task a time that fits what it is; fall back to a morning / midday
  // / evening spread for tasks whose wording gives no cue, without doubling up
  // on a time a matched task already claimed.
  const chosen = picked.slice(0, 3)
  const inferred = chosen.map(inferTaskTime)
  const used = new Set(inferred.filter(Boolean))
  let s = 0
  return chosen.map((title, i) => {
    let time = inferred[i]
    if (!time) {
      while (s < NN_DEFAULT_TIMES.length && used.has(NN_DEFAULT_TIMES[s])) s++
      time = NN_DEFAULT_TIMES[s] || NN_DEFAULT_TIMES[i] || '1:00 PM'
      used.add(time)
      s++
    }
    return { id: `nn${i + 1}`, title, completed: false, time }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Personalized dream-life story — FIRST PERSON (a window into their own future)
// ─────────────────────────────────────────────────────────────────────────────
const DOMAIN_STORY = {
  career:
    "The work is unmistakably mine now. Not a job that drains me — a craft I've sharpened until people seek it out. I walk into rooms carrying the quiet confidence of someone who built something real, and my calendar is full of work that actually matters.",
  wealth:
    "Money has stopped being a source of fear and become a source of freedom. I don't flinch at the unexpected anymore. Income arrives from things I built, even on the quiet days, and every decision I make comes from abundance instead of scarcity.",
  health:
    "My body is proof of discipline turned into habit. The morning movement isn't punishment — it's ritual. The energy that once felt impossible is just my baseline now. I notice it in the mirror, in the stairs I take two at a time, in the clarity a cared-for body gives my mind.",
  relationships:
    'The people who matter most are genuinely present in my life. Not rushed, not half-there — present. Dinners run long. Laughter comes easy. The bonds that hold me up were built on purpose, and they run deep.',
  creative:
    "My creative work exists in the world and has found the people it was meant for. Strangers reach out to tell me it shifted something in them. I create now not for approval, but because the voice inside me finally has a clear, strong channel.",
  travel:
    "The world has become familiar to me in the best way. Cafés in cities other people only see on screens. A worn passport. A wider sense of what's possible. Home is now both a place and a feeling I carry everywhere.",
  mindset:
    "There's a stillness to my life that once felt out of reach. Not emptiness — fullness. The peace of knowing exactly who I am and why I rise each morning. The noise is filtered out. What's left is signal.",
  lifestyle:
    "I own my time now. My days are shaped on my terms — deep work when it counts, true rest when it's earned, no permission needed. Freedom isn't a someday word anymore; it's just Tuesday.",
}

export function generateDreamStory({ age, answers, goalTitle, extra }) {
  const ageNum = parseInt(age, 10)
  const ageLine = Number.isFinite(ageNum) ? ` I'm ${ageNum + 5} now.` : ''

  const openings = [
    `It's an ordinary Tuesday five years from now, and I don't hear an alarm.${ageLine}`,
    `Five years from now, I open my eyes — not to dread, but to possibility.${ageLine}`,
    `The sun isn't fully up yet, and I'm already awake — not because I have to be, but because I want to be.${ageLine}`,
  ]
  const opening = openings[Math.floor(Math.random() * openings.length)]

  const ranked = Object.entries(answers || {})
    .filter(([, v]) => v >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
  const top = ranked.length ? ranked.slice(0, 3) : ['mindset']
  const chapters = top.map((d) => DOMAIN_STORY[d] || DOMAIN_STORY.mindset)

  const extraLine =
    extra && extra.trim()
      ? `And the part I added in my own words — "${extra.trim()}" — runs quietly through all of it. It's the detail that makes this life unmistakably mine.`
      : ''
  const goalLine = goalTitle
    ? `It all traces back to one decision I made years earlier: to ${goalTitle.charAt(0).toLowerCase() + goalTitle.slice(1)}. That single commitment pulled everything else into focus.`
    : ''
  const closing =
    "This is not a fantasy. It's a destination. Every version of this life I've imagined is reachable — not through luck, not through waiting, but through a sequence of precise daily decisions made with relentless consistency. The roadmap exists. The path is lit. The only question is whether I choose to walk it."

  return [opening, ...chapters, extraLine, goalLine, closing].filter(Boolean).join('\n\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Coach voice
// ─────────────────────────────────────────────────────────────────────────────
export const COACH_MESSAGES = {
  tough: {
    welcome: "Listen up. You said you want to change your life — so let's find out what you're made of. First, the basics:",
    dreamIntro: "Good. First, the truth about where you stand today. Rate each area honestly — and add the details I should know. No lying to yourself.",
    futureIntro: "Noted. Now where you're headed. Tell me how much each of these actually matters to you — and what it looks like if you win.",
    pursuingPrompt: "Before we add anything new, what are you already on the hook for? School, numbers at work, a relationship, a project — lay out what you're actually carrying right now.",
    goalPrompt: 'From the place you stand now, looking toward the life you’re called to live, name three commitments you could make in the next 3–12 months that would open the path. Choose the ones that feel alive, necessary, and true.',
    toneConfirm: "Noted. I'm going to push you harder than you think you need. That's the deal.",
    generating: 'Building your roadmap. This is the last time excuses get to live here.',
    checkIn: 'Day {streak}. You either showed up or you didn’t. Which is it?',
    intro: "I'm here. When you're ready to put in the work, talk to me — no fluff.",
    review: "It's been 25 days. Time to face the scoreboard. Let's see what you actually moved on your long game.",
  },
  gentle: {
    welcome: "Hi there, welcome — I'm so glad you're here. Let's start gently with a little about you:",
    dreamIntro: "Lovely to meet you. Let's start with a gentle, honest look at where life stands for you today — rate each area, and share anything you'd like me to understand.",
    futureIntro: "Thank you for sharing that. Now let's dream a little — how much does each of these matter for the life you want? Paint the picture wherever you'd like.",
    pursuingPrompt: "Before we dream up new commitments, I'd love to know what you're already holding. What are you pursuing right now — school, work, a relationship, a project? Anything that's already part of your days.",
    goalPrompt: 'From the place you stand now, looking toward the life you’re called to live, name three commitments you could make in the next 3–12 months that would open the path. Choose the ones that feel alive, necessary, and true.',
    toneConfirm: "I'll be right here, supporting and encouraging you every step. You've got this.",
    generating: 'Creating something beautiful for you. I’m honored to walk this with you.',
    checkIn: 'How are you feeling today, {name}? Every small step matters.',
    intro: "Hi {name}, I'm right here with you. Whenever you want to talk, I'm listening. 🌱",
    review: "It's been about 25 days — I'd love to gently check in on your bigger goals and celebrate what you've grown.",
  },
  default: {
    welcome: "Hey — ready to build something real? I'm {coach}. Before we dream, tell me a bit about you:",
    dreamIntro: "Nice to meet you. First, an honest snapshot — where does each part of life actually stand for you today? Add context wherever you want me to really get it.",
    futureIntro: "Got it. Now the part I love — where you're going. How much does each of these matter for the life you want?",
    pursuingPrompt: "Before we set anything new, tell me what you're already carrying. What are you currently pursuing — school, a target at work, a relationship, a project? Whatever's already on your plate.",
    goalPrompt: 'From the place you stand now, looking toward the life you’re called to live, name three commitments you could make in the next 3–12 months that would open the path. Choose the ones that feel alive, necessary, and true.',
    toneConfirm: "Perfect. I'll balance honesty with encouragement — enough edge to keep you moving, enough support to keep you believing.",
    generating: 'Building your personalized roadmap. This is where things get real.',
    checkIn: 'Hey {name} — checking in. How’s the momentum feeling today?',
    intro: "Hey {name} — I'm Nova, here whenever you need me. What's on your mind?",
    review: "It's been 25 days. Let's review your long-term goals together and lock in everything you've actually reached.",
  },
}

export const PROACTIVE_MESSAGES = {
  tough: [
    "You've been quiet. That's either focus or avoidance. Which is it?",
    "The scoreboard doesn't care about your feelings. What did you do today?",
    "Every day you don't move forward, you're moving backward. Where are you?",
    'Comfort is the enemy. What uncomfortable thing did you do today?',
  ],
  gentle: [
    'Hey, just checking in. How are you feeling about your progress? 🌱',
    "Remember, every small step counts. What's one thing you did today for your goals?",
    "It's okay to have hard days. What would feel like a win for you right now?",
    "You're doing something most people never do — you're trying. That matters.",
  ],
  default: [
    "Checking in — what's your energy like today?",
    "You've been building momentum. Don't lose it. What's next on the list?",
    'Quick check: did you hit your actions today? What’s standing in your way?',
    'Honest question — are you moving toward your dream life today, or away from it?',
  ],
}

const COACH_RESPONSES = {
  tough: {
    default: 'I hear you. Now what are you going to do about it?',
    good: "Good. Keep that momentum. Don't celebrate yet — the work continues.",
    bad: "That's not acceptable. What got in your way, and how do you eliminate it?",
    help: 'You don’t need motivation. You need discipline. Pick one action and do it now.',
    why: 'Because you told me you wanted more. Were you lying to yourself?',
  },
  gentle: {
    default: 'Thank you for sharing that with me. How are you feeling about it?',
    good: "That's wonderful! You should feel proud of yourself. Keep going! 🌟",
    bad: "It's okay — setbacks are part of the journey. What would help you feel better?",
    help: "Of course! Let's take it one small step at a time. What feels most manageable?",
    why: "Because you deserve the life you've been dreaming of. That's reason enough.",
  },
  default: {
    default: "Got it. Let's think this through — what's the next right move?",
    good: 'Love that. Keep stacking those wins. Momentum is your best tool.',
    bad: 'That happens. The question is what you do next. Ready to reset?',
    help: "Here's what I'd focus on: pick the one action that moves the needle most and start there.",
    why: 'Because the version of you that exists after you achieve this is worth fighting for.',
  },
}

export function getResponseKey(text) {
  const lower = text.toLowerCase()
  if (/good|great|progress|did it|done|completed|win|success|crushed/.test(lower)) return 'good'
  if (/bad|failed|missed|couldn't|hard|struggle|behind|skip/.test(lower)) return 'bad'
  if (/help|how|what should|advice|tip|stuck|don't know/.test(lower)) return 'help'
  if (/why|point|matter|give up|worth it/.test(lower)) return 'why'
  return 'default'
}

export function coachReply(tone, text) {
  const responses = COACH_RESPONSES[tone]
  return responses[getResponseKey(text)] || responses.default
}

// ─── Plans ──────────────────────────────────────────────────────────────────
// A "plan" is a lightweight, generic structured document Nova can build on
// request — a workout split, a diet, a study schedule, a habit routine, anything.
// ONE shape (sections → items) flexes to fit them all, and the whole thing rides
// the profile blob so it syncs and is available on every device with no new
// backend table. normalizePlan is the tolerant guard that turns a loose AI/JSON
// payload into the exact shape the UI renders, so a malformed response can never
// crash the Plans screen (it mirrors normalizeAiGoal's defensiveness).
export const PLAN_KINDS = ['workout', 'diet', 'study', 'habit', 'custom']
const PLAN_KIND_LABELS = { workout: 'Workout', diet: 'Diet', study: 'Study', habit: 'Habit', custom: 'Plan' }
export const planKindLabel = (kind) => PLAN_KIND_LABELS[kind] || 'Plan'

const planId = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`
const clampStr = (s, n) => String(s == null ? '' : s).trim().slice(0, n)

// Count checklist items and how many are done — used for the "M/N" progress that
// makes any plan double as a checklist on its card.
export function planProgress(plan) {
  const items = (plan?.sections || []).flatMap((s) => s.items || [])
  return { done: items.filter((i) => i.done).length, total: items.length }
}

export function normalizePlan(raw, opts = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const kind = PLAN_KINDS.includes(opts.kind) ? opts.kind : PLAN_KINDS.includes(src.kind) ? src.kind : 'custom'
  const title = clampStr(src.title, 80) || `${planKindLabel(kind)} plan`
  const summary = clampStr(src.summary, 200)

  const sections = (Array.isArray(src.sections) ? src.sections : [])
    .slice(0, 12)
    .map((s, i) => {
      const sec = s && typeof s === 'object' ? s : {}
      const items = (Array.isArray(sec.items) ? sec.items : [])
        .slice(0, 40)
        .map((it) => {
          if (typeof it === 'string') {
            const text = clampStr(it, 160)
            return text ? { id: planId('it'), text, done: false } : null
          }
          const obj = it && typeof it === 'object' ? it : {}
          const text = clampStr(obj.text || obj.title, 160)
          if (!text) return null
          const detail = clampStr(obj.detail, 200)
          // Preserve a done flag when re-normalizing an existing plan.
          return { id: planId('it'), text, ...(detail ? { detail } : {}), done: obj.done === true }
        })
        .filter(Boolean)
      if (!items.length) return null
      return { id: planId('sec'), title: clampStr(sec.title, 80) || `Section ${i + 1}`, items }
    })
    .filter(Boolean)

  const now = new Date().toISOString()
  return {
    id: opts.id || planId('plan'),
    kind,
    title,
    summary,
    sections,
    goalId: opts.goalId || (typeof src.goalId === 'string' ? src.goalId : null) || null,
    source: 'nova',
    createdAt: opts.createdAt || now,
    updatedAt: now,
  }
}
