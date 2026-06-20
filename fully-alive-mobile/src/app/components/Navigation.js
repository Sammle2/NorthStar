import React, { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { Home, Map, MessageCircle, Target, Users } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { C, F } from '../tokens'

const TABS = [
  { id: 'dashboard', icon: Home, label: 'Today' },
  { id: 'roadmap', icon: Map, label: 'Roadmap' },
  { id: 'sprints', icon: Target, label: 'Sprints' },
  { id: 'community', icon: Users, label: 'Friends' },
  { id: 'coach', icon: MessageCircle, label: 'Coach' },
]
const PAD = 16
const DOT = 4

// Bottom tab bar — amber active state with a single glowing dot that slides
// between tabs (Figma's shared layout indicator).
export default function Navigation({ active, onChange }) {
  const [w, setW] = useState(0)
  const idx = Math.max(0, TABS.findIndex((t) => t.id === active))
  const anim = useRef(new Animated.Value(idx)).current

  useEffect(() => {
    Animated.spring(anim, { toValue: idx, useNativeDriver: true, friction: 9, tension: 90 }).start()
  }, [idx])

  const slot = w > 0 ? (w - PAD * 2) / TABS.length : 0
  const centers = TABS.map((_, i) => PAD + slot * i + slot / 2 - DOT / 2)
  const dotX = anim.interpolate({
    inputRange: TABS.map((_, i) => i),
    outputRange: centers,
  })

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
      <LinearGradient colors={['transparent', C.bg]} locations={[0, 0.55]} style={{ paddingTop: 18 }}>
        <View
          onLayout={(e) => setW(e.nativeEvent.layout.width)}
          style={{ maxWidth: 520, alignSelf: 'center', width: '100%', paddingTop: 10, paddingBottom: 26, paddingHorizontal: PAD }}
        >
          {/* Sliding indicator dot */}
          {w > 0 && (
            <Animated.View
              style={{
                position: 'absolute',
                top: 2,
                left: 0,
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                backgroundColor: C.amber,
                transform: [{ translateX: dotX }],
                shadowColor: C.amber,
                shadowOpacity: 0.8,
                shadowRadius: 5,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
          )}

          <View style={{ flexDirection: 'row' }}>
            {TABS.map(({ id, icon: Icon, label }) => {
              const on = active === id
              const color = on ? C.amber : C.faint2
              return (
                <Pressable key={id} onPress={() => onChange(id)} style={{ flex: 1, alignItems: 'center', paddingTop: 6 }}>
                  <View style={on ? { shadowColor: C.amber, shadowOpacity: 0.55, shadowRadius: 7, shadowOffset: { width: 0, height: 0 } } : undefined}>
                    <Icon size={22} color={color} strokeWidth={2} />
                  </View>
                  <Text style={{ marginTop: 4, fontSize: 9.5, fontFamily: F.medium, color, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </LinearGradient>
    </View>
  )
}
