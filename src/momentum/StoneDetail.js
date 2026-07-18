// ── Momentum roadmap: full-screen detail sheet ───────────────────────────────
// A self-contained overlay that hosts StoneTrack for one Dream. Opened from the
// Roadmap (via MomentumCard) and from a Today-tab task's source tag — the "deep
// link into that stone's Roadmap view" the spec asks for, without depending on
// Max's celestial-map selection state.
import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { X } from 'lucide-react-native'
import { C, F } from '../app/tokens'
import StoneTrack from './StoneTrack'

export default function StoneDetail({ goal, onUpdate, onClose, situation = '' }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: C.bg, zIndex: 150 }}>
      <View style={{ paddingTop: 52, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.display, fontSize: 10.5, color: C.faint, letterSpacing: 2.5 }}>MOMENTUM ROADMAP</Text>
          <Text numberOfLines={1} style={{ fontFamily: F.display, fontSize: 17, color: C.ink, letterSpacing: 0.5, marginTop: 2 }}>{goal?.title || 'Dream'}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={8}><X size={20} color={C.dim} /></Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <StoneTrack goal={goal} onUpdate={onUpdate} situation={situation} />
      </ScrollView>
    </View>
  )
}
