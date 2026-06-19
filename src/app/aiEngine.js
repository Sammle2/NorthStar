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
export const DREAM_QUESTIONS = [
  { key: 'career', emoji: '🚀', label: 'A career or business you’re proud of', short: 'work' },
  { key: 'wealth', emoji: '💎', label: 'Financial freedom and security', short: 'wealth' },
  { key: 'health', emoji: '⚡', label: 'A fit, healthy, energized body', short: 'health' },
  { key: 'relationships', emoji: '❤️', label: 'Deep relationships and family', short: 'relationships' },
  { key: 'creative', emoji: '🎨', label: 'Creating things that matter to you', short: 'creative work' },
  { key: 'travel', emoji: '🌍', label: 'Travel, adventure, new experiences', short: 'adventure' },
  { key: 'mindset', emoji: '🧘', label: 'Inner peace, growth, and purpose', short: 'inner growth' },
  { key: 'lifestyle', emoji: '🕊️', label: 'Freedom over your time and life', short: 'lifestyle' },
]

export const INTEREST_LEVELS = [
  { v: 0, label: 'Not for me' },
  { v: 1, label: 'A little' },
  { v: 2, label: 'A lot' },
  { v: 3, label: "It's everything" },
]
export const MAX_EVERYTHING = 2 // only two domains can be "It's everything"

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
  'travel', 'world', 'adventure', 'explore', 'abroad', 'nomad',
  'family', 'children', 'parents', 'relationship', 'partner', 'marriage', 'friends', 'community',
  'peace', 'happy', 'purpose', 'meaning', 'growth', 'learn', 'wisdom', 'mindset', 'spiritual', 'confidence', 'discipline', 'focus', 'meditation', 'journal',
  'lifestyle', 'remote', 'balance', 'flexible',
  'graduate', 'school', 'college', 'degree', 'study', 'essay', 'dream', 'goal', 'build', 'master', 'improve', 'achieve',
]
const VOCAB_SET = new Set(VOCAB)

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
  if (lower.length < 4 || VOCAB_SET.has(lower) || /\d/.test(lower)) return tok
  const maxD = lower.length <= 5 ? 1 : 2
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

export function validateGoal(raw) {
  const hit = UNATTAINABLE.find((u) => u.re.test(raw))
  if (hit) {
    return {
      ok: false,
      what: hit.what,
      clarify: `I can't map a path to "${hit.what}" — that's outside what daily action can change. But there's almost always a real goal underneath it. What are you actually after? (more confidence, presence, respect, peace?) Tell me that.`,
    }
  }
  if (raw.trim().length < 3) {
    return { ok: false, what: 'that', clarify: "Give me a little more to work with — what's the goal, in a sentence?" }
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
function mkSteps(arr) {
  return arr.map((t, i) => ({ id: `s${i + 1}`, title: t, completed: false }))
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
  return { id, title, category: tmpl ? tmpl.category : 'mindset', progress: 0, milestones, dailyActions: mkActions(actions) }
}

// Regenerate the milestones (+ stepping stones) for a goal title — the "redo" /
// AI-assist flow when the user doesn't know what their milestones should be.
export function regenerateMilestones(goalTitle, extra = '') {
  const theme = primaryThemeOf(goalTitle + ' ' + (extra || ''))
  return buildMilestones(theme, actionableTitle(goalTitle), true)
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
    goals.push({ id: `goal-${domain}`, title: tmpl.title, category: tmpl.category, progress: 0, milestones: domainMilestones(domain), dailyActions: mkActions(tmpl.dailyActions) })
  }

  if (goals.length === 1) {
    const d = primaryTheme === 'mindset' ? 'health' : 'mindset'
    const tmpl = DOMAIN_TEMPLATES[d]
    goals.push({ id: 'goal-support', title: tmpl.title, category: tmpl.category, progress: 0, milestones: domainMilestones(d), dailyActions: mkActions(tmpl.dailyActions) })
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

export function generateNonNegotiables(profile) {
  const fromGoals = (profile.goals || []).map((g) => (g.dailyActions || [])[0]?.title).filter(Boolean)
  const picked = []
  for (const t of fromGoals) {
    if (picked.length >= 3) break
    if (!picked.includes(t)) picked.push(t)
  }
  for (const t of UNIVERSAL_NN) {
    if (picked.length >= 3) break
    if (!picked.includes(t)) picked.push(t)
  }
  return picked.slice(0, 3).map((title, i) => ({ id: `nn${i + 1}`, title, completed: false, time: NN_DEFAULT_TIMES[i] || '12:00 PM' }))
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
    dreamIntro: "Good. Now I want to see what you're actually chasing. Rate how much each of these pulls at you — be honest.",
    extraPrompt: "Anything else about the life you want that I should know? Don't hold back. (Or skip it.)",
    goalPrompt: "Now the one that matters most. What's the single goal you need to conquer first — the one that changes everything?",
    toneConfirm: "Noted. I'm going to push you harder than you think you need. That's the deal.",
    generating: 'Building your roadmap. This is the last time excuses get to live here.',
    checkIn: 'Day {streak}. You either showed up or you didn’t. Which is it?',
    review: "It's been 25 days. Time to face the scoreboard. Let's see what you actually moved on your long game.",
  },
  gentle: {
    welcome: "Hi there, welcome — I'm so glad you're here. Let's start gently with a little about you:",
    dreamIntro: "Beautiful. Now let's dream together — for each one, just tell me how much it speaks to your heart.",
    extraPrompt: 'Is there anything else about your dream life you’d love me to hold onto? (Totally okay to skip.)',
    goalPrompt: "Wonderful. What's one goal you'd most love to nurture and grow first?",
    toneConfirm: "I'll be right here, supporting and encouraging you every step. You've got this.",
    generating: 'Creating something beautiful for you. I’m honored to walk this with you.',
    checkIn: 'How are you feeling today, {name}? Every small step matters.',
    review: "It's been about 25 days — I'd love to gently check in on your bigger goals and celebrate what you've grown.",
  },
  default: {
    welcome: "Hey — ready to build something real? I'm {coach}. Before we dream, tell me a bit about you:",
    dreamIntro: "Nice to meet you. Let's map what your dream life actually looks like — rate how much each one matters to you.",
    extraPrompt: "Anything else about your dream life you want me to know? Add it here — or skip ahead.",
    goalPrompt: "Now the big one. What's the single most important goal you want to tackle first?",
    toneConfirm: "Perfect. I'll balance honesty with encouragement — enough edge to keep you moving, enough support to keep you believing.",
    generating: 'Building your personalized roadmap. This is where things get real.',
    checkIn: 'Hey {name} — checking in. How’s the momentum feeling today?',
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
