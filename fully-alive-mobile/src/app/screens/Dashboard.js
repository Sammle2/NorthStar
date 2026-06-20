import React, { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Bell, CheckCircle2, Circle, Clock, Settings as SettingsIcon, Zap } from 'lucide-react-native'
import { C, F } from '../tokens'
import GlowProgress from '../components/GlowProgress'
import StreakBadge from '../components/StreakBadge'
import VisionBoard from '../components/VisionBoard'
import { COACH_MESSAGES, NN_TIME_OPTIONS, generateNonNegotiables } from '../aiEngine'
import { getGreeting, todayKey } from '../store'

// Screen 4 — the home. A clean, emoji-free checklist of exactly three
// non-negotiables for today. Hit all three and the day's streak is locked in.
export default function Dashboard({ profile, onUpdate, onOpenSettings }) {
  const firstName = profile.name.split(' ')[0]
  const today = todayKey()
  const todayNN = profile.nonNeg?.[today]
  const [editingTime, setEditingTime] = useState(null)

  // Auto-populate today's three non-negotiables on first open of the day.
  useEffect(() => {
    if (!todayNN) {
      const list = generateNonNegotiables(profile)
      onUpdate({ ...profile, nonNeg: { ...(profile.nonNeg || {}), [today]: list } })
    }
  }, [todayNN])

  const list = todayNN || []
  const doneCount = list.filter((n) => n.completed).length

  const toggle = (id) => {
    const next = list.map((n) => (n.id === id ? { ...n, completed: !n.completed } : n))
    let updated = { ...profile, nonNeg: { ...profile.nonNeg, [today]: next } }
    // Streak goes up at most ONCE per day: only on the first time all three are
    // done today. lastCheckIn === today means today's streak is already banked,
    // so toggling on/off afterward can never add to it again.
    const allDone = next.length === 3 && next.every((n) => n.completed)
    if (allDone && profile.lastCheckIn !== today) {
      updated = { ...updated, streak: profile.streak + 1, lastCheckIn: today }
    }
    onUpdate(updated)
  }

  const setTime = (id, time) => {
    const next = list.map((n) => (n.id === id ? { ...n, time } : n))
    onUpdate({ ...profile, nonNeg: { ...profile.nonNeg, [today]: next } })
    setEditingTime(null)
  }

  const checkInMessage = COACH_MESSAGES[profile.coachTone].checkIn
    .replace('{streak}', String(profile.streak))
    .replace('{name}', firstName)

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 120, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 56, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.body, fontSize: 13.5, color: C.faint }}>{getGreeting()},</Text>
            <Text style={{ fontFamily: F.display, fontSize: 32, color: C.ink, letterSpacing: 1, lineHeight: 40 }}>
              {firstName}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 10 }}>
            <Pressable onPress={onOpenSettings} hitSlop={10}>
              <SettingsIcon size={20} color={C.faint} strokeWidth={2} />
            </Pressable>
            <StreakBadge streak={profile.streak} size="sm" />
          </View>
        </View>

        {/* Today's progress */}
        <View style={{ marginTop: 24, borderRadius: 16, padding: 20, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, letterSpacing: 1, textTransform: 'uppercase' }}>
              Today's Non-Negotiables
            </Text>
            <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: C.violet }}>{doneCount}/3</Text>
          </View>
          <GlowProgress value={(doneCount / 3) * 100} color={C.violet} height={8} />
          {doneCount === 3 ? (
            <Text style={{ fontFamily: F.body, fontSize: 13, color: C.green, marginTop: 12 }}>All three done — your streak is secured.</Text>
          ) : (
            <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.faint, marginTop: 12 }}>Hit all three to lock in today's streak.</Text>
          )}
        </View>
      </View>

      {/* Notification reminder */}
      <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.amberFill, borderWidth: 1, borderColor: 'rgba(245,158,11,0.1)' }}>
          <Bell size={13} color={C.amber} strokeWidth={2} />
          <Text style={{ fontFamily: F.body, fontSize: 12, color: C.dim }}>Daily reminder set · 8:00 AM</Text>
        </View>
      </View>

      {/* The three non-negotiables — each anchored to a time of day */}
      <View style={{ paddingHorizontal: 24, gap: 12 }}>
        <Text style={{ fontFamily: F.display, fontSize: 12, color: C.faint, letterSpacing: 2.2 }}>DO THESE TODAY</Text>
        {list.map((nn) => (
          <View
            key={nn.id}
            style={{
              borderRadius: 16,
              paddingHorizontal: 18,
              paddingVertical: 16,
              backgroundColor: nn.completed ? 'rgba(245,158,11,0.08)' : 'rgba(13,13,27,0.8)',
              borderWidth: 1,
              borderColor: nn.completed ? 'rgba(245,158,11,0.3)' : C.line,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Pressable onPress={() => toggle(nn.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                {nn.completed ? (
                  <CheckCircle2 size={24} color={C.amber} strokeWidth={2.2} />
                ) : (
                  <Circle size={24} color={C.faint3} strokeWidth={2} />
                )}
                <Text
                  style={{
                    flex: 1,
                    fontFamily: F.medium,
                    fontSize: 15,
                    color: nn.completed ? C.faint : C.ink2,
                    textDecorationLine: nn.completed ? 'line-through' : 'none',
                  }}
                >
                  {nn.title}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setEditingTime(editingTime === nn.id ? null : nn.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: editingTime === nn.id ? 'rgba(245,158,11,0.16)' : C.violetFill07, borderWidth: 1, borderColor: editingTime === nn.id ? C.amber : C.lineMid }}
              >
                <Clock size={12} color={editingTime === nn.id ? C.amber : C.violet} strokeWidth={2} />
                <Text style={{ fontFamily: F.semibold, fontSize: 11.5, color: editingTime === nn.id ? C.amber : C.violet }}>{nn.time || 'Set time'}</Text>
              </Pressable>
            </View>

            {editingTime === nn.id && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 7 }}>
                {NN_TIME_OPTIONS.map((t) => {
                  const on = nn.time === t
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setTime(nn.id, t)}
                      style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: on ? C.amber : C.violetFill07, borderWidth: 1, borderColor: on ? C.amber : C.lineMid }}
                    >
                      <Text style={{ fontFamily: on ? F.bold : F.body, fontSize: 11.5, color: on ? C.amberInk : C.dim }}>{t}</Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            )}
          </View>
        ))}
      </View>

      {/* Coach check-in line */}
      <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, padding: 16, backgroundColor: 'rgba(124,58,237,0.1)', borderWidth: 1, borderColor: C.lineMid }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(124,58,237,0.3)' }}>
            <Zap size={15} color={C.violet} strokeWidth={2.2} />
          </View>
          <Text style={{ flex: 1, fontFamily: F.body, fontSize: 13.5, color: C.ink2, lineHeight: 21 }}>{checkInMessage}</Text>
        </View>
      </View>

      {/* Vision board — what the dream looks like */}
      <VisionBoard profile={profile} onUpdate={onUpdate} />
    </ScrollView>
  )
}
