import React, { useEffect, useRef } from 'react'
import { Animated, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { C, F } from '../tokens'

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
