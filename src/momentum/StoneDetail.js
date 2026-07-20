// ── Momentum roadmap: full-screen detail sheet ───────────────────────────────
// A self-contained overlay that hosts StoneTrack for one Dream. Opened from the
// Roadmap (via MomentumCard) and from a Today-tab task's source tag — the "deep
// link into that stone's Roadmap view" the spec asks for, without depending on
// Max's celestial-map selection state.
import React from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { X } from 'lucide-react-native'
import { C, F } from '../app/tokens'
import StoneTrack from './StoneTrack'

export default function StoneDetail({ goal, onUpdate, onClose, situation = '' }) {
  // A Modal, NOT an absolutely-positioned View: this sheet is mounted inside the
  // small MomentumCard wrapper, and in React Native `position:'absolute'` is
  // relative to the PARENT — so inset-0 rendered a thin strip at the card instead
  // of a full screen, which made the "Stone X of Y" button look dead.
  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: C.bg }}>
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
    </Modal>
  )
}
