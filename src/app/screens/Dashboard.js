import React, { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Bell, BookOpen, CheckCircle2, ChevronRight, Circle, ClipboardList, Clock, Dumbbell, Repeat, Settings as SettingsIcon, Utensils } from 'lucide-react-native'
import { C, F } from '../tokens'
import GlowProgress from '../components/GlowProgress'
import StreakBadge from '../components/StreakBadge'
import { SparkStar } from '../components/StarMark'
import { COACH_MESSAGES, NN_TIME_OPTIONS, generateNonNegotiables, planKindLabel, planProgress } from '../aiEngine'
import { currentStreak, getGreeting, todayKey, yesterdayKey } from '../store'

const KIND_ICON = { workout: Dumbbell, diet: Utensils, study: BookOpen, habit: Repeat, custom: ClipboardList }

// Screen 4 — the home. A clean, emoji-free checklist of exactly three
// non-negotiables for today. Hit all three and the day's streak is locked in.
export default function Dashboard({ profile, onUpdate, onOpenSettings, onOpenCoach, onOpenPlans }) {
  const firstName = (profile.name || '').split(' ')[0]
  const today = todayKey()
  const plans = profile.plans || []
  const todayNN = profile.nonNeg?.[today]
  const [editingTime, setEditingTime] = useState(null)

  // Auto-populate today's three non-negotiables on first open of the day.
  useEffect(() => {
    if (!todayNN) {
      const list = generateNonNegotiables(profile)
      onUpdate({ ...profile, nonNeg: { ...(profile.nonNeg || {}), [today]: list } })
    }
  }, [todayNN])

  // A missed day breaks the chain: if the last banked day is neither today nor
  // yesterday, persist the reset so every reader of profile.streak (posts, Nova,
  // the public projection) sees the truth, not a stale count.
  useEffect(() => {
    if ((profile.streak || 0) > 0 && profile.lastCheckIn !== today && profile.lastCheckIn !== yesterdayKey()) {
      onUpdate({ ...profile, streak: 0, lastCheckIn: null })
    }
  }, [today, profile.lastCheckIn])

  const list = todayNN || []
  const doneCount = list.filter((n) => n.completed).length

  const toggle = (id) => {
    const next = list.map((n) => (n.id === id ? { ...n, completed: !n.completed } : n))
    let updated = { ...profile, nonNeg: { ...profile.nonNeg, [today]: next } }
    const allDone = next.length === 3 && next.every((n) => n.completed)
    if (allDone && profile.lastCheckIn !== today) {
      // Bank today: +1 on an unbroken chain (last banked day was yesterday);
      // otherwise this is a fresh start and the streak begins again at 1.
      updated = { ...updated, streak: currentStreak(profile) + 1, lastCheckIn: today }
    } else if (!allDone && profile.lastCheckIn === today) {
      // De-selecting after today was banked takes the day back: the streak
      // steps down and the chain now ends yesterday (or nowhere, if that was
      // the only day).
      const stepped = Math.max(0, (profile.streak || 0) - 1)
      updated = { ...updated, streak: stepped, lastCheckIn: stepped > 0 ? yesterdayKey() : null }
    }
    onUpdate(updated)
  }

  const setTime = (id, time) => {
    const next = list.map((n) => (n.id === id ? { ...n, time } : n))
    onUpdate({ ...profile, nonNeg: { ...profile.nonNeg, [today]: next } })
    setEditingTime(null)
  }

  const checkInMessage = COACH_MESSAGES[profile.coachTone].checkIn
    .replace('{streak}', String(currentStreak(profile)))
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
            <StreakBadge streak={currentStreak(profile)} size="sm" />
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
          <Text style={{ fontFamily: F.body, fontSize: 12, color: C.dim }}>Daily check-in · 1:00 PM</Text>
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

      {/* My Plans — an always-visible, inviting entry into the Plans library. The
          amber arrow signals "tap me"; the copy encourages a first plan when empty
          and celebrates momentum once there are some. The preview strip below only
          appears once there are plans to show. */}
      <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
        <Pressable
          onPress={() => onOpenPlans && onOpenPlans()}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            borderRadius: 18,
            padding: 18,
            backgroundColor: pressed ? 'rgba(167,139,250,0.2)' : C.violetFill,
            borderWidth: 1,
            borderColor: pressed ? C.violet : C.lineStrong,
          })}
        >
          <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(167,139,250,0.18)' }}>
            <ClipboardList size={22} color={C.violet} strokeWidth={2.1} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 15.5, color: C.ink, letterSpacing: 0.2 }}>My Plans</Text>
            <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginTop: 3, lineHeight: 17 }}>
              {plans.length > 0
                ? `${plans.length} plan${plans.length === 1 ? '' : 's'} in motion — tap to keep it going`
                : 'Have Nova build a workout, diet — anything. Your plans live here.'}
            </Text>
          </View>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.amber, shadowColor: C.amber, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }}>
            <ChevronRight size={19} color={C.amberInk} strokeWidth={2.6} />
          </View>
        </Pressable>
      </View>
      {plans.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 24, paddingTop: 12 }}>
          {plans.map((plan) => {
              const Icon = KIND_ICON[plan.kind] || ClipboardList
              const { done, total } = planProgress(plan)
              return (
                <Pressable
                  key={plan.id}
                  onPress={() => onOpenPlans && onOpenPlans(plan.id)}
                  style={({ pressed }) => ({ width: 190, borderRadius: 16, padding: 15, backgroundColor: pressed ? 'rgba(167,139,250,0.16)' : C.card, borderWidth: 1, borderColor: pressed ? C.violet : C.line })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill }}>
                      <Icon size={18} color={C.violet} strokeWidth={2.1} />
                    </View>
                    <Text style={{ fontFamily: F.semibold, fontSize: 9.5, color: C.violet, letterSpacing: 1.2 }}>{planKindLabel(plan.kind).toUpperCase()}</Text>
                  </View>
                  <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.ink, marginTop: 11 }} numberOfLines={2}>{plan.title}</Text>
                  {total > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <GlowProgress value={(done / total) * 100} color={done === total ? C.green : C.violet} height={5} />
                      <Text style={{ fontFamily: F.body, fontSize: 10.5, color: C.faint, marginTop: 6 }}>{done}/{total} done</Text>
                    </View>
                  )}
                </Pressable>
              )
            })}
          </ScrollView>
      )}

      {/* Coach check-in line */}
      <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
        {/* Nova's check-in — tap to open the chat and reply */}
        <Pressable
          onPress={onOpenCoach}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, padding: 16, backgroundColor: pressed ? 'rgba(124,58,237,0.18)' : 'rgba(124,58,237,0.1)', borderWidth: 1, borderColor: pressed ? C.violet : C.lineMid })}
        >
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(124,58,237,0.3)' }}>
            <SparkStar size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.body, fontSize: 13.5, color: C.ink2, lineHeight: 21 }}>{checkInMessage}</Text>
            <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.violet, marginTop: 8 }}>Reply to {profile.coachName || 'Nova'} →</Text>
          </View>
        </Pressable>
      </View>

    </ScrollView>
  )
}
