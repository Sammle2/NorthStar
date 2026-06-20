import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowRight, Sparkles } from 'lucide-react-native'
import { C, F } from '../tokens'
import StarField from '../components/StarField'
import Glow from '../components/Glow'
import Wordmark from '../components/Wordmark'

// Screen 1 — cinematic starfield hero: badge → NORTHSTAR wordmark → tagline → amber CTA.
export default function Welcome({ onBegin, onSignIn }) {
  // Read live viewport from the hook (module-level Dimensions can be 0 on a fresh
  // web/mobile load, which clipped the wordmark). Fallbacks keep it sane pre-layout.
  const win = useWindowDimensions()
  const SW = win.width || 390
  const SH = win.height || 800

  const [starting, setStarting] = useState(false)
  const begin = async () => {
    if (starting) return
    setStarting(true)
    try { await onBegin?.() } finally { setStarting(false) }
  }

  const fade = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(20)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start()
  }, [])

  // Comfortable side margins so the 9-letter "NORTHSTAR" wordmark never clips,
  // even on narrow phones / wider font rendering in mobile Safari.
  const wmWidth = Math.min(SW - 56, 400)
  const wmSize = Math.min(wmWidth / 7.8, 52)

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <StarField count={140} seed={11} />
      <Glow size={600} color="#7c3aed" opacity={0.18} style={{ top: SH * 0.5 - 360, left: SW / 2 - 300 }} />
      <Glow size={400} color="#f59e0b" opacity={0.12} style={{ bottom: SH * 0.06, right: -60 }} />

      <Animated.View style={{ alignItems: 'center', paddingHorizontal: 32, opacity: fade, transform: [{ translateY: rise }] }}>
        {/* Badge */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 9,
            marginBottom: 40,
            backgroundColor: C.violetFill,
            borderWidth: 1,
            borderColor: C.lineStrong,
          }}
        >
          <Sparkles size={13} color={C.violet} strokeWidth={2.2} />
          <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.violet, letterSpacing: 1.6 }}>
            AI-POWERED LIFE COACHING
          </Text>
        </View>

        {/* Wordmark */}
        <Wordmark text="NORTHSTAR" size={wmSize} width={wmWidth} />

        <Text
          style={{
            fontFamily: F.body,
            fontSize: 17,
            color: C.dim,
            textAlign: 'center',
            marginTop: 24,
            lineHeight: 29,
            maxWidth: 340,
          }}
        >
          You're here to elevate your life. I'm here to help make it happen.
        </Text>

        {/* CTA */}
        <Pressable
          onPress={begin}
          disabled={starting}
          style={({ pressed }) => [{ marginTop: 48, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
        >
          <LinearGradient
            colors={[C.amber, C.amberDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              borderRadius: 999,
              paddingVertical: 16,
              paddingHorizontal: 36,
              minWidth: 240,
              shadowColor: C.amber,
              shadowOpacity: 0.45,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 0 },
            }}
          >
            {starting ? (
              <ActivityIndicator size="small" color={C.amberInk} />
            ) : (
              <>
                <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.amberInk, letterSpacing: 0.3 }}>
                  Begin Your Journey
                </Text>
                <ArrowRight size={18} color={C.amberInk} strokeWidth={2.4} />
              </>
            )}
          </LinearGradient>
        </Pressable>

        <Text style={{ fontFamily: F.body, fontSize: 13, color: C.faint2, marginTop: 24 }}>
          Free to start · Your data stays yours
        </Text>

        {/* Returning users */}
        <Pressable onPress={onSignIn} disabled={starting} hitSlop={8} style={{ marginTop: 18, flexDirection: 'row', gap: 6 }}>
          <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim }}>Already have an account?</Text>
          <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.amber }}>Sign in</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}
