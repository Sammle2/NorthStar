import React from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { Card, H1, Kicker } from '../components/Ui'
import PersonalitySlider from '../components/PersonalitySlider'

export default function Settings({ state, colors, setPersonality, setThemeMode, onResetIntake }) {
  const dark = state.user.themeMode === 'dark'
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pad}>
      <Kicker colors={colors}>Tune the system</Kicker>
      <H1 colors={colors}>Settings</H1>

      <Card colors={colors} style={{ marginTop: 18 }}>
        <Kicker colors={colors}>Jarvis tone</Kicker>
        <PersonalitySlider value={state.user.jarvisPersonality} onChange={setPersonality} colors={colors} />
        <Text style={{ color: colors.inkFaint, fontSize: 12.5, marginTop: 10, lineHeight: 18 }}>
          Loving softens the edges. Tough names the gap. Balanced is the advisor in the room.
        </Text>
      </Card>

      <Card colors={colors} style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>Dark mode</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12.5, marginTop: 2 }}>
            Respect the evenings. Light mode for daylight planning.
          </Text>
        </View>
        <Switch
          value={dark}
          onValueChange={(v) => setThemeMode(v ? 'dark' : 'light')}
          trackColor={{ true: colors.electric, false: '#888' }}
        />
      </Card>

      <Card colors={colors} style={{ marginTop: 14 }}>
        <Kicker colors={colors}>Notifications</Kicker>
        <Text style={{ color: colors.inkDim, fontSize: 13.5, lineHeight: 20 }}>
          Morning nudge, afternoon progress check, evening reflection — Jarvis delivers these in-app
          today. Push notifications arrive with the device build (expo-notifications).
        </Text>
      </Card>

      <Card colors={colors} style={{ marginTop: 14 }}>
        <Kicker colors={colors}>Vision</Kicker>
        <Text style={{ color: colors.inkDim, fontSize: 13.5, lineHeight: 20 }}>
          This app exists so you never have to wonder what to do next. Architecture over motivation.
        </Text>
        <Pressable onPress={onResetIntake} style={{ marginTop: 14 }}>
          <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 13.5 }}>
            Redo intake (rebuild dreams & goals)
          </Text>
        </Pressable>
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  pad: { padding: 22, paddingBottom: 110 },
})
