import React, { useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Btn, Card, H1, Kicker } from '../components/Ui'
import { dateKey } from '../storage'

// End-of-day reflection: mood, notes, optional private photo proof.
export default function Reflect({ state, colors, onSave }) {
  const today = dateKey()
  const existing = state.reflections[today] || {}
  const [mood, setMood] = useState(existing.mood || 0)
  const [note, setNote] = useState(existing.note || '')
  const [photo, setPhoto] = useState(existing.photo || null)
  const [saved, setSaved] = useState(false)

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4 })
    if (!res.canceled && res.assets?.[0]?.uri) setPhoto(res.assets[0].uri)
  }

  const tasks = state.tasks[today] || []
  const done = tasks.filter((t) => t.completed).length

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pad}>
      <Kicker colors={colors}>End of day</Kicker>
      <H1 colors={colors}>Reflect</H1>
      <Text style={{ color: colors.inkDim, fontSize: 14, marginTop: 8 }}>
        {done} of {tasks.length} tasks logged today. Nothing logs itself — that’s the point.
      </Text>

      <Card colors={colors} style={{ marginTop: 18 }}>
        <Kicker colors={colors}>Mood</Kicker>
        <View style={styles.moodRow}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <Pressable
              key={n}
              onPress={() => setMood(n)}
              style={[
                styles.moodBtn,
                { borderColor: colors.lineStrong },
                mood === n && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text style={{ color: mood === n ? colors.primaryInk : colors.inkDim, fontWeight: '700', fontSize: 12 }}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card colors={colors} style={{ marginTop: 14 }}>
        <Kicker colors={colors}>Notes</Kicker>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="What moved today? What got skipped, and why?"
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
        />
      </Card>

      <Card colors={colors} style={{ marginTop: 14 }}>
        <Kicker colors={colors}>Proof (private — never shared)</Kicker>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} />
        ) : (
          <Text style={{ color: colors.inkFaint, fontSize: 13 }}>A photo of the work, the run, the page.</Text>
        )}
        <Btn colors={colors} kind="ghost" label={photo ? 'Replace photo' : 'Add photo'} onPress={pickPhoto} style={{ marginTop: 12 }} />
      </Card>

      <Btn
        colors={colors}
        label={saved ? 'Saved ✓' : 'Save reflection'}
        onPress={() => {
          onSave(today, { mood, note, photo })
          setSaved(true)
          setTimeout(() => setSaved(false), 1500)
        }}
        style={{ marginTop: 18 }}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  pad: { padding: 22, paddingBottom: 110 },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  moodBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 90, fontSize: 14.5, textAlignVertical: 'top' },
  photo: { width: '100%', height: 180, borderRadius: 12 },
})
