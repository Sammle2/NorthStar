// ── Momentum roadmap: the Circle shared-dreams board ─────────────────────────
// Dropped into CircleDetail (one import + one line). A Circle keeps NO separate
// trackable — it references members' existing Dreams via a per-member visibility
// level. This shows the board (each shared Dream's momentum, honouring its level)
// and lets you choose which of YOUR Dreams to share, and how much:
//   Off · Title only · Title + momentum (default) · Full tasks
// Cooperative mode is parallel effort — a plain list, no ranking. (Competitive
// ranking is a documented v2 layer, intentionally not built here.)
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Eye, TrendingUp } from 'lucide-react-native'
import { C, F } from '../app/tokens'
import Avatar from '../app/components/Avatar'
import GlowProgress from '../app/components/GlowProgress'
import { CATEGORY_COLORS, normalizeCategory } from '../app/mockData'
import { activeDreams } from './store'
import { getCircleDreams, getMyCircleShares, shareDreamToCircle, unshareDreamFromCircle } from '../services/circleService'

const LEVELS = [
  { id: 'off', label: 'Off' },
  { id: 'dream_only', label: 'Title' },
  { id: 'dream_and_momentum', label: 'Momentum' },
  { id: 'full_tasks', label: 'Tasks' },
]

export default function CircleDreams({ circle, profile }) {
  const [board, setBoard] = useState([])
  const [shares, setShares] = useState({})
  const [loading, setLoading] = useState(true)
  const mine = activeDreams(profile)

  const load = async () => {
    const [b, s] = await Promise.all([getCircleDreams(circle.id), getMyCircleShares(circle.id)])
    setBoard(b); setShares(s); setLoading(false)
  }
  useEffect(() => { load() }, [circle.id])

  const setLevel = async (goalId, level) => {
    setShares((prev) => { const next = { ...prev }; if (level === 'off') delete next[goalId]; else next[goalId] = level; return next })
    if (level === 'off') await unshareDreamFromCircle(circle.id, goalId)
    else await shareDreamToCircle(circle.id, goalId, level)
    load()
  }

  return (
    <View style={{ marginTop: 8, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <TrendingUp size={14} color={C.violet} strokeWidth={2.3} />
        <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2 }}>SHARED DREAMS</Text>
      </View>

      {/* The board */}
      {loading ? (
        <ActivityIndicator size="small" color={C.faint} style={{ marginVertical: 12 }} />
      ) : board.length === 0 ? (
        <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.faint, lineHeight: 18, marginBottom: 8 }}>
          No Dreams shared here yet. Share one below and your circle sees your momentum — no daily details unless you choose.
        </Text>
      ) : (
        board.map((d) => {
          const color = CATEGORY_COLORS[normalizeCategory(d.category)] || C.violet
          const isMe = d.user_id === profile.userId
          const showMomentum = d.share_level === 'dream_and_momentum' || d.share_level === 'full_tasks'
          return (
            <View key={`${d.user_id}:${d.dream_id}`} style={{ borderRadius: 14, padding: 14, marginBottom: 10, backgroundColor: 'rgba(13,13,27,0.8)', borderWidth: 1, borderColor: C.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar url={d.avatar_url} name={d.name} username={d.username} size={30} />
                <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 12, color: C.dim }} numberOfLines={1}>{isMe ? 'You' : (d.name || 'Member')}</Text>
                {showMomentum && d.momentum_pct != null && (
                  <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: momentumColor(d.momentum_pct) }}>{d.momentum_pct}%</Text>
                )}
              </View>
              <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: C.ink, marginTop: 8 }} numberOfLines={1}>{d.dream_title || 'A Dream'}</Text>
              {showMomentum && d.stone_title ? (
                <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint, marginTop: 2 }}>
                  Stone {(d.stone_index ?? 0) + 1} of {d.stone_count || '—'} · {d.stone_title}{d.outcome_text ? ` · ${d.outcome_text}` : ''}
                </Text>
              ) : null}
              {showMomentum && d.momentum_pct != null && (
                <View style={{ marginTop: 10 }}><GlowProgress value={d.momentum_pct} color={momentumColor(d.momentum_pct)} height={5} /></View>
              )}
              {d.share_level === 'full_tasks' && Array.isArray(d.tasks) && d.tasks.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {d.tasks.map((t, i) => (
                    <View key={i} style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: color + '18', borderWidth: 1, borderColor: color + '40' }}>
                      <Text style={{ fontFamily: F.medium, fontSize: 10.5, color }}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
              {!showMomentum && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <Eye size={11} color={C.faint2} /><Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint2 }}>Title only</Text>
                </View>
              )}
            </View>
          )
        })
      )}

      {/* Share YOUR dreams */}
      {mine.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.faint, letterSpacing: 1.4, marginBottom: 10 }}>SHARE YOUR DREAMS WITH THIS CIRCLE</Text>
          {mine.map((g) => {
            const cur = shares[g.id] || 'off'
            return (
              <View key={g.id} style={{ borderRadius: 14, padding: 12, marginBottom: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: C.ink, marginBottom: 10 }} numberOfLines={1}>{g.title}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {LEVELS.map((l) => {
                    const on = cur === l.id
                    return (
                      <Pressable key={l.id} onPress={() => setLevel(g.id, l.id)} style={{ flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center', backgroundColor: on ? (l.id === 'off' ? C.faint3 : C.violet) : C.violetFill07, borderWidth: 1, borderColor: on ? (l.id === 'off' ? C.faint3 : C.violet) : C.lineMid }}>
                        <Text style={{ fontFamily: on ? F.bold : F.medium, fontSize: 10.5, color: on ? (l.id === 'off' ? C.ink : C.amberInk) : C.dim }}>{l.label}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

function momentumColor(p) {
  if (p == null) return C.faint
  if (p >= 75) return C.green
  if (p >= 40) return C.amber
  return C.red
}
