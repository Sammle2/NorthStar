import React, { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import CoachAvatar from '../components/CoachAvatar'
import { COACH_MESSAGES, recomputeGoal } from '../aiEngine'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../mockData'

// The Coach's long-term goal review, surfaced every 25 days. For each goal it
// asks about the NEXT unreached milestone only (sequential lock). Whatever the
// user confirms gets checked off permanently; the rest is left untouched.
export default function CoachReview({ profile, onComplete }) {
  const reviewable = profile.goals
    .map((g) => {
      const idx = g.milestones.findIndex((m) => !m.completed)
      return idx >= 0 ? { goal: g, idx, milestone: g.milestones[idx] } : null
    })
    .filter(Boolean)

  const [decisions, setDecisions] = useState({}) // goalId -> true (reached) / false (not yet)

  const lockIn = () => {
    const goals = profile.goals.map((g) => {
      if (!decisions[g.id]) return g
      const idx = g.milestones.findIndex((m) => !m.completed)
      if (idx < 0) return g
      // Reaching a milestone completes it and all its stepping stones.
      const milestones = g.milestones.map((m, i) =>
        i === idx ? { ...m, completed: true, steps: (m.steps || []).map((s) => ({ ...s, completed: true })) } : m,
      )
      return recomputeGoal({ ...g, milestones })
    })
    onComplete({ ...profile, goals, lastLongTermReview: new Date().toISOString() })
  }

  const reachedCount = Object.values(decisions).filter(Boolean).length

  return (
    <View style={{ position: 'absolute', inset: 0, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 200 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 40, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        {/* Coach header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <CoachAvatar size={46} />
          <View>
            <Text style={{ fontFamily: F.display, fontSize: 14.5, color: C.ink, letterSpacing: 1.4 }}>
              {(profile.coachName || 'Nova').toUpperCase()}
            </Text>
            <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.amber, marginTop: 2 }}>25-day check-in</Text>
          </View>
        </View>

        {/* Intro bubble */}
        <View style={{ backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineMid, borderRadius: 18, borderBottomLeftRadius: 4, padding: 16, marginBottom: 24 }}>
          <Text style={{ fontFamily: F.body, fontSize: 14.5, lineHeight: 23, color: C.ink2 }}>
            {COACH_MESSAGES[profile.coachTone].review}
          </Text>
        </View>

        <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 14 }}>
          HAVE YOU REACHED THESE?
        </Text>

        {reviewable.map(({ goal, milestone }) => {
          const color = CATEGORY_COLORS[goal.category] || C.amber
          const icon = CATEGORY_ICONS[goal.category] || '✦'
          const choice = decisions[goal.id]
          return (
            <View key={goal.id} style={{ borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: 'rgba(13,13,27,0.8)', padding: 16, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 15 }}>{icon}</Text>
                <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.dim, flex: 1 }} numberOfLines={1}>{goal.title}</Text>
              </View>
              {milestone.horizon && (
                <Text style={{ fontFamily: F.bold, fontSize: 10, color, letterSpacing: 1.4, marginBottom: 4 }}>{milestone.horizon.toUpperCase()}</Text>
              )}
              <Text style={{ fontFamily: F.medium, fontSize: 14.5, color: C.ink, lineHeight: 21, marginBottom: 14 }}>{milestone.title}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => setDecisions((d) => ({ ...d, [goal.id]: true }))}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    borderRadius: 12,
                    paddingVertical: 11,
                    backgroundColor: choice === true ? color + '22' : 'transparent',
                    borderWidth: 1,
                    borderColor: choice === true ? color : C.lineStrong,
                  }}
                >
                  <Check size={15} color={choice === true ? color : C.dim} strokeWidth={2.4} />
                  <Text style={{ fontFamily: F.semibold, fontSize: 13, color: choice === true ? color : C.dim }}>Reached it</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDecisions((d) => ({ ...d, [goal.id]: false }))}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    borderRadius: 12,
                    paddingVertical: 11,
                    backgroundColor: choice === false ? 'rgba(255,255,255,0.06)' : 'transparent',
                    borderWidth: 1,
                    borderColor: choice === false ? C.faint2 : C.lineStrong,
                  }}
                >
                  <X size={15} color={C.faint} strokeWidth={2.4} />
                  <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.faint }}>Not yet</Text>
                </Pressable>
              </View>
            </View>
          )
        })}

        <Pressable onPress={lockIn} style={{ marginTop: 10 }}>
          <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>
              {reachedCount > 0 ? `Lock in ${reachedCount} milestone${reachedCount > 1 ? 's' : ''}` : 'Continue'}
            </Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  )
}
