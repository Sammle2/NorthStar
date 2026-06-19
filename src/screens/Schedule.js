import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import TaskCard from '../components/TaskCard'
import { H1, Kicker } from '../components/Ui'
import { dateKey } from '../storage'

// Today only. High priority stays; low priority is optional by design.
export default function Schedule({ state, colors, onComplete, onSkip, onMove }) {
  const tasks = state.tasks[dateKey()] || []
  const high = tasks.filter((t) => t.priority === 'high')
  const low = tasks.filter((t) => t.priority === 'low')
  const missedMorning = new Date().getHours() >= 12 && high.some((t) => !t.completed && !t.skipped)

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pad}>
      <Kicker colors={colors}>Today</Kicker>
      <H1 colors={colors}>The Work</H1>
      {missedMorning && (
        <Text style={{ color: colors.inkDim, fontSize: 13.5, marginTop: 10, lineHeight: 20 }}>
          A slow start doesn’t waste the day. The priorities below are still yours to win — everything
          else is optional now.
        </Text>
      )}

      <Text style={[styles.section, { color: colors.inkFaint }]}>PRIORITY — NON-NEGOTIABLE</Text>
      {high.map((t) => (
        <TaskCard key={t.id} task={t} colors={colors} onComplete={() => onComplete(t.id)} onSkip={() => onSkip(t.id)} />
      ))}
      {high.length === 0 && (
        <Text style={{ color: colors.inkFaint, fontSize: 13.5 }}>Nothing yet — accept goals in intake.</Text>
      )}

      <Text style={[styles.section, { color: colors.inkFaint }]}>OPTIONAL — IF THE DAY ALLOWS</Text>
      {low.map((t, i) => (
        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1 }}>
            <TaskCard task={t} colors={colors} onComplete={() => onComplete(t.id)} onSkip={() => onSkip(t.id)} />
          </View>
          <View style={{ marginBottom: 10, width: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[styles.arrow, { color: i === 0 ? colors.inkFaint : colors.inkDim }]} onPress={() => onMove(t.id, -1)}>
              ↑
            </Text>
            <Text
              style={[styles.arrow, { color: i === low.length - 1 ? colors.inkFaint : colors.inkDim }]}
              onPress={() => onMove(t.id, 1)}
            >
              ↓
            </Text>
          </View>
        </View>
      ))}
      <Text style={{ color: colors.inkFaint, fontSize: 12.5, marginTop: 14, lineHeight: 18 }}>
        Swipe right to complete · swipe left to skip · arrows reorder the optional list.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  pad: { padding: 22, paddingBottom: 110 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginTop: 22, marginBottom: 10 },
  arrow: { fontSize: 16, paddingHorizontal: 6, paddingVertical: 2 },
})
