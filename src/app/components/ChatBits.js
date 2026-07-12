import React, { useEffect, useRef } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BookOpen, ChevronRight, ClipboardList, Dumbbell, Repeat, Utensils } from 'lucide-react-native'
import { C, F } from '../tokens'

// Kind → icon, shared by the chat card. (Dashboard/Plans keep their own tiny copy
// so each screen stays self-contained — the map is one line.)
const KIND_ICON = { workout: Dumbbell, diet: Utensils, study: BookOpen, habit: Repeat, custom: ClipboardList }

// A single chat bubble. Coach = violet glass, left-aligned; user = amber, right-aligned.
export function MessageBubble({ from, text, time }) {
  const isUser = from === 'user'
  const fade = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(10)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start()
  }, [])

  const radius = isUser
    ? { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 4, borderBottomLeftRadius: 18 }
    : { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4 }

  const body = (
    <Text style={{ fontFamily: F.body, fontSize: 14.5, lineHeight: 23, color: isUser ? C.amberInk : C.ink2 }}>
      {text}
    </Text>
  )

  return (
    <Animated.View
      style={{
        alignItems: isUser ? 'flex-end' : 'flex-start',
        opacity: fade,
        transform: [{ translateY: rise }],
      }}
    >
      {isUser ? (
        <LinearGradient
          colors={[C.amber, C.amberDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[{ maxWidth: '80%', paddingVertical: 12, paddingHorizontal: 16 }, radius]}
        >
          {body}
        </LinearGradient>
      ) : (
        <View
          style={[
            { maxWidth: '80%', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineMid },
            radius,
          ]}
        >
          {body}
        </View>
      )}
      {time ? <Text style={{ fontFamily: F.body, fontSize: 10.5, color: C.faint3, marginTop: 4 }}>{time}</Text> : null}
    </Animated.View>
  )
}

// An inline plan card in the chat — Nova posts one when she's built a plan. It's
// a compact snapshot (title, kind, counts) that taps through to the full plan in
// the Plans overlay. Rendered from a lightweight `card` object stored on the
// message, so the whole plan isn't duplicated into the chat history.
export function PlanCard({ card, onOpen }) {
  const fade = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(10)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start()
  }, [])
  const Icon = KIND_ICON[card?.kind] || ClipboardList
  const parts = [
    `${card?.sectionCount || 0} ${card?.sectionCount === 1 ? 'section' : 'sections'}`,
    `${card?.itemCount || 0} ${card?.itemCount === 1 ? 'item' : 'items'}`,
  ]
  return (
    <Animated.View style={{ alignItems: 'flex-start', opacity: fade, transform: [{ translateY: rise }] }}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => ({
          maxWidth: '86%',
          borderRadius: 18,
          borderTopLeftRadius: 4,
          padding: 14,
          backgroundColor: pressed ? 'rgba(167,139,250,0.16)' : C.violetFill,
          borderWidth: 1,
          borderColor: pressed ? C.violet : C.lineStrong,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(167,139,250,0.16)' }}>
            <Icon size={20} color={C.violet} strokeWidth={2.1} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 10, color: C.violet, letterSpacing: 1.4 }}>SAVED TO YOUR PLANS</Text>
            <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink, marginTop: 2 }} numberOfLines={2}>{card?.title || 'Plan'}</Text>
            <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 3 }}>{parts.join(' · ')}</Text>
          </View>
          <ChevronRight size={18} color={C.violet} strokeWidth={2.2} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(167,139,250,0.12)', borderWidth: 1, borderColor: C.lineMid }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.violet }}>View plan</Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

// Three violet dots pulsing in sequence — the "Coach is typing" indicator.
export function TypingDots() {
  const dots = [useRef(new Animated.Value(0.5)).current, useRef(new Animated.Value(0.5)).current, useRef(new Animated.Value(0.5)).current]
  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(d, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.5, duration: 400, useNativeDriver: true }),
        ]),
      ),
    )
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [])
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: C.violetFill,
          borderWidth: 1,
          borderColor: C.lineMid,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomRightRadius: 18,
          borderBottomLeftRadius: 4,
        }}
      >
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.violet, opacity: d, transform: [{ scale: d.interpolate({ inputRange: [0.5, 1], outputRange: [1, 1.4] }) }] }}
          />
        ))}
      </View>
    </View>
  )
}
