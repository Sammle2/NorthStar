import React from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { C, F } from '../tokens'

// Explicit terms consent — account creation is gated on this box being checked.
// The linked documents are the public no-login pages served at /terms and /privacy.
const openDoc = (path) => { if (Platform.OS === 'web') window.open(path, '_blank') }

export default function TermsAgreeRow({ agreed, onToggle, style }) {
  return (
    <Pressable onPress={onToggle} style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, style]}>
      <View style={{ width: 22, height: 22, borderRadius: 7, marginTop: 1, borderWidth: 2, borderColor: agreed ? C.amber : C.faint3, backgroundColor: agreed ? C.amber : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {agreed && <Check size={13} color={C.amberInk} strokeWidth={3.4} />}
      </View>
      <Text style={{ flex: 1, fontFamily: F.body, fontSize: 11.5, color: C.faint, lineHeight: 17 }}>
        I agree to the{' '}
        <Text onPress={() => openDoc('/terms')} style={{ color: C.amber, fontFamily: F.semibold }}>Terms &amp; Conditions</Text>
        {' '}and{' '}
        <Text onPress={() => openDoc('/privacy')} style={{ color: C.amber, fontFamily: F.semibold }}>Privacy Policy</Text>
        , and confirm I’m at least 13.
      </Text>
    </Pressable>
  )
}
