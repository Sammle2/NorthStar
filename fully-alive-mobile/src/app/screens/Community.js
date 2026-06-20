import React, { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, ScrollView, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Flame, Heart, Trophy, UserPlus } from 'lucide-react-native'
import { C, F } from '../tokens'
import GlowProgress from '../components/GlowProgress'
import StreakBadge from '../components/StreakBadge'
import { AVATAR_COLORS, MOCK_FRIENDS } from '../mockData'

// Screen 5 — your circle: streak leaderboard + friend cards with dream snippets.
export default function Community({ profile }) {
  const [friends, setFriends] = useState(MOCK_FRIENDS)
  const firstName = profile.name.split(' ')[0]

  const toggleInspire = (id) =>
    setFriends((prev) => prev.map((f) => (f.id === id ? { ...f, inspired: !f.inspired } : f)))

  const leaderboard = [
    { name: firstName, streak: profile.streak, isMe: true },
    ...friends.map((f) => ({ name: f.name.split(' ')[0], streak: f.streak, isMe: false })),
  ].sort((a, b) => b.streak - a.streak)

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 120, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 56, paddingBottom: 24 }}>
        <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 3 }}>YOUR CIRCLE</Text>
        <Text style={{ fontFamily: F.display, fontSize: 30, color: C.ink, letterSpacing: 1.4, lineHeight: 38 }}>COMMUNITY</Text>

        {/* Leaderboard */}
        <View
          style={{
            marginTop: 24,
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(245,158,11,0.15)',
            backgroundColor: 'rgba(245,158,11,0.04)',
          }}
        >
          <View
            style={{
              paddingHorizontal: 20,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(245,158,11,0.1)',
            }}
          >
            <Trophy size={15} color={C.amber} strokeWidth={2.2} />
            <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.amber, letterSpacing: 2.2 }}>STREAK LEADERBOARD</Text>
          </View>
          <View style={{ padding: 12, gap: 4 }}>
            {leaderboard.slice(0, 5).map((e, i) => {
              const rankColor = i === 0 ? C.amber : i === 1 ? C.dim : i === 2 ? '#b45309' : C.faint2
              return (
                <View
                  key={e.name + i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: e.isMe ? 'rgba(245,158,11,0.08)' : 'transparent',
                    borderWidth: 1,
                    borderColor: e.isMe ? 'rgba(245,158,11,0.15)' : 'transparent',
                  }}
                >
                  <Text style={{ fontFamily: F.display, fontSize: 14, color: rankColor, width: 20, textAlign: 'center' }}>
                    {i + 1}
                  </Text>
                  <Text style={{ fontFamily: F.body, fontSize: 14, color: e.isMe ? C.amber : C.ink2, flex: 1 }}>
                    {e.name} {e.isMe ? '(You)' : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Flame size={13} color={C.amber} strokeWidth={2.2} />
                    <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.amber }}>{e.streak}</Text>
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      </View>

      {/* Friends */}
      <View style={{ paddingHorizontal: 24, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.display, fontSize: 11.5, color: C.faint, letterSpacing: 2.2 }}>FRIENDS</Text>
          <Pressable
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: C.violetFill,
              borderWidth: 1,
              borderColor: C.lineStrong,
            }}
          >
            <UserPlus size={12} color={C.violet} strokeWidth={2.2} />
            <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.violet }}>Add Friend</Text>
          </Pressable>
        </View>

        {friends.map((friend, fi) => (
          <FriendCard
            key={friend.id}
            friend={friend}
            color={AVATAR_COLORS[fi % AVATAR_COLORS.length]}
            delay={fi * 80}
            onInspire={() => toggleInspire(friend.id)}
          />
        ))}
      </View>
    </ScrollView>
  )
}

function FriendCard({ friend, color, delay, onInspire }) {
  const fade = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(16)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start()
  }, [])
  return (
    <Animated.View
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: C.line,
        backgroundColor: 'rgba(13,13,27,0.8)',
        opacity: fade,
        transform: [{ translateY: rise }],
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: color + '38',
            borderWidth: 2,
            borderColor: color + '40',
          }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 13, color }}>{friend.avatar}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.ink }}>{friend.name}</Text>
          <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 2 }} numberOfLines={1}>
            {friend.currentGoal}
          </Text>
        </View>
        <StreakBadge streak={friend.streak} size="sm" />
      </View>

      {/* Dream snippet */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.faint, fontStyle: 'italic', lineHeight: 20 }}>
          "{friend.dreamSnippet}"
        </Text>
      </View>

      {/* Progress + inspire */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <GlowProgress value={friend.progress} color={color} height={4} />
          <Text style={{ fontFamily: F.body, fontSize: 10.5, color: C.faint2, marginTop: 4 }}>
            {friend.progress}% to dream life
          </Text>
        </View>
        <Pressable
          onPress={onInspire}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: friend.inspired ? 'rgba(244,114,182,0.15)' : 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: friend.inspired ? 'rgba(244,114,182,0.4)' : 'rgba(255,255,255,0.08)',
          }}
        >
          <Heart size={14} color={friend.inspired ? C.pink : C.faint2} fill={friend.inspired ? C.pink : 'transparent'} strokeWidth={2.2} />
          <Text style={{ fontFamily: F.body, fontSize: 12, color: friend.inspired ? C.pink : C.faint2 }}>Inspire</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}
