import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowRight, Star } from 'lucide-react-native'
import { C, F } from '../tokens'
import StarField from '../components/StarField'
import Glow from '../components/Glow'

// Typewriter hook — reveals `text` char-by-char after a start delay.
function useTypewriter(text, speed = 18, startDelay = 400, active = true) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)
  useEffect(() => {
    if (!active) return
    if (!text) {
      // No story to type — consider it "done" so the continue button still appears.
      setDisplayed('')
      setDone(true)
      return
    }
    setDisplayed('')
    setDone(false)
    let i = 0
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) {
          clearInterval(intervalRef.current)
          setDone(true)
        }
      }, speed)
    }, startDelay)
    return () => {
      clearTimeout(timeoutRef.current)
      clearInterval(intervalRef.current)
    }
  }, [text, active])
  // Let the user tap to reveal the rest instantly, then the button appears.
  const skip = () => {
    if (!text) return
    clearTimeout(timeoutRef.current)
    clearInterval(intervalRef.current)
    setDisplayed(text)
    setDone(true)
  }
  return { displayed, done, skip }
}

// Screen 3 — full-screen cinematic reveal of the Coach's dream-life story.
export default function DreamReveal({ profile, onContinue }) {
  const [phase, setPhase] = useState('intro') // intro | story | cta
  const firstName = profile.name.split(' ')[0]
  // Typing speed slowed 50% (16ms → 24ms/char) so the future sinks in.
  const { displayed, done, skip } = useTypewriter(profile.dreamStory, 24, 300, phase !== 'intro')
  const typed = displayed.split('\n\n').filter(Boolean)
  // Graceful fallback so the body is never blank when there's no generated story.
  const paragraphs = typed.length
    ? typed
    : ['Your dream is taking shape. Let’s build the roadmap that gets you there.']

  const introFade = useRef(new Animated.Value(0)).current
  const starSpin = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(introFade, { toValue: 1, duration: 700, useNativeDriver: true }).start()
    Animated.loop(
      Animated.sequence([
        Animated.timing(starSpin, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(starSpin, { toValue: -1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(starSpin, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start()
    const t = setTimeout(() => setPhase('story'), 2200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (done && phase === 'story') {
      const t = setTimeout(() => setPhase('cta'), 900)
      return () => clearTimeout(t)
    }
  }, [done, phase])

  // The continue button is gated on the full story being read: phase only moves
  // to 'cta' once the typewriter reports `done` (see the effect above). The user
  // can tap the text to reveal the rest instantly rather than waiting.

  const spin = starSpin.interpolate({ inputRange: [-1, 1], outputRange: ['-15deg', '15deg'] })

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, overflow: 'hidden' }}>
      <Glow size={600} color="#7c3aed" opacity={0.22} style={{ top: -160, left: -40, right: 0, alignSelf: 'center' }} />
      <Glow size={500} color="#f59e0b" opacity={0.1} style={{ bottom: -120, right: -120 }} />
      <StarField count={50} seed={23} maxTop={60} />

      {phase === 'intro' ? (
        <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, opacity: introFade }}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Star size={48} color={C.amber} fill={C.amber} strokeWidth={1.5} />
          </Animated.View>
          <Text
            style={{
              fontFamily: F.display,
              fontSize: 30,
              color: C.ink,
              letterSpacing: 2,
              marginTop: 24,
              textAlign: 'center',
            }}
          >
            YOUR DREAM LIFE
          </Text>
          <Text style={{ fontFamily: F.body, fontSize: 16, color: C.faint, marginTop: 16, textAlign: 'center' }}>
            Coach has a vision for you, {firstName}.
          </Text>
        </Animated.View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 72, paddingBottom: 60, maxWidth: 640, alignSelf: 'center', width: '100%' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <Star size={18} color={C.amber} fill={C.amber} strokeWidth={1.5} />
            <Text style={{ fontFamily: F.display, fontSize: 12, color: C.amber, letterSpacing: 3 }}>
              YOUR DREAM LIFE · {profile.name.toUpperCase()}
            </Text>
          </View>

          <Pressable onPress={skip} style={{ gap: 24 }}>
            {paragraphs.map((para, i) => (
              <Text
                key={i}
                style={{
                  fontFamily: i === 0 ? F.body : F.body,
                  fontSize: 16.5,
                  lineHeight: 30,
                  color: i === 0 ? C.ink : C.ink3,
                  fontStyle: i === 0 ? 'italic' : 'normal',
                }}
              >
                {para}
              </Text>
            ))}
          </Pressable>

          {phase === 'story' && !done && (
            <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint2, textAlign: 'center', marginTop: 28 }}>
              Tap to reveal
            </Text>
          )}

          {phase === 'cta' && (
            <RevealCta onContinue={onContinue} />
          )}
        </ScrollView>
      )}
    </View>
  )
}

function RevealCta({ onContinue }) {
  const fade = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(20)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start()
  }, [])
  return (
    <Animated.View style={{ alignItems: 'center', marginTop: 64, gap: 16, opacity: fade, transform: [{ translateY: rise }] }}>
      <Text style={{ fontFamily: F.display, fontSize: 13, color: C.faint, letterSpacing: 2 }}>
        THIS IS WAITING FOR YOU
      </Text>
      <Pressable onPress={onContinue} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <LinearGradient
          colors={[C.amber, C.amberDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderRadius: 999,
            paddingVertical: 16,
            paddingHorizontal: 36,
            shadowColor: C.amber,
            shadowOpacity: 0.4,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 0 },
          }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.amberInk }}>Build My Roadmap</Text>
          <ArrowRight size={18} color={C.amberInk} strokeWidth={2.4} />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  )
}
