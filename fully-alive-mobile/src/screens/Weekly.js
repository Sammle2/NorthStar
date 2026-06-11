import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Card, H1, Kicker } from '../components/Ui'
import DreamArt from '../components/DreamArt'
import { onePercent, weekContext, goalPct } from '../logic'
import { catColor } from '../theme'
import { weekly } from '../jarvis'

// Weekly summary + the 1% Better engine + the dream-life story.
export default function Weekly({ state, colors }) {
  const [summary, setSummary] = useState(null)
  const wk = weekContext(state)
  const op = onePercent(state)

  useEffect(() => {
    let cancelled = false
    weekly(state).then((reply) => !cancelled && setSummary(reply))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pad}>
      <Kicker colors={colors}>The long game</Kicker>
      <H1 colors={colors}>1% Better</H1>

      <View style={styles.statRow}>
        <Card colors={colors} style={styles.stat}>
          <Text style={[styles.big, { color: colors.glow }]}>+{op.compoundPct}%</Text>
          <Text style={[styles.lbl, { color: colors.inkFaint }]}>compounded growth{'\n'}({op.daysImproved} won days)</Text>
        </Card>
        <Card colors={colors} style={styles.stat}>
          <Text style={[styles.big, { color: colors.ink }]}>{Math.round(wk.weekCompletion * 100)}%</Text>
          <Text style={[styles.lbl, { color: colors.inkFaint }]}>priority tasks{'\n'}this week</Text>
        </Card>
        <Card colors={colors} style={styles.stat}>
          <Text style={[styles.big, { color: colors.ink }]}>{wk.avgMood ?? '—'}</Text>
          <Text style={[styles.lbl, { color: colors.inkFaint }]}>average{'\n'}mood</Text>
        </Card>
      </View>

      {/* The Roadmap — a glowing journey from here to the dream (from the Figma mockup) */}
      <Card colors={colors} style={{ marginTop: 14 }}>
        <Kicker colors={colors}>The road ahead</Kicker>
        {state.dreams.map((d, di) => {
          const goals = d.goals.filter((g) => g.accepted)
          if (!goals.length) return null
          const dreamPct = goals.reduce((s, g) => s + goalPct(state, g), 0) / goals.length
          return (
            <View key={d.id} style={{ flexDirection: 'row', marginTop: di > 0 ? 18 : 0 }}>
              {/* glowing rail */}
              <View style={{ width: 22, alignItems: 'center' }}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: dreamPct >= 100 ? colors.success : catColor(d.category),
                    shadowColor: catColor(d.category),
                    shadowOpacity: 0.9,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 0 },
                  }}
                />
                <View style={{ flex: 1, width: 2, backgroundColor: 'rgba(120,160,255,0.18)', marginTop: 4 }} />
              </View>
              <View style={{ flex: 1, paddingBottom: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 15.5, flex: 1 }} numberOfLines={1}>
                    {d.title}
                  </Text>
                  <Text style={{ color: colors.cyan, fontWeight: '800', fontSize: 12.5 }}>
                    {dreamPct.toFixed(0)}%
                  </Text>
                </View>
                {goals.map((g) => {
                  const pct = goalPct(state, g)
                  return (
                    <View key={g.id} style={{ marginTop: 10 }}>
                      <Text style={{ color: pct >= 100 ? colors.success : colors.inkDim, fontSize: 13 }} numberOfLines={1}>
                        {pct >= 100 ? '✦ ' : ''}{g.title}
                      </Text>
                      {/* GlowProgress */}
                      <View style={{ height: 6, borderRadius: 99, backgroundColor: 'rgba(120,160,255,0.12)', marginTop: 5, overflow: 'visible' }}>
                        <View
                          style={{
                            width: `${Math.max(pct, 2)}%`,
                            height: '100%',
                            borderRadius: 99,
                            backgroundColor: pct >= 100 ? colors.success : catColor(d.category),
                            shadowColor: pct >= 100 ? colors.success : catColor(d.category),
                            shadowOpacity: 0.8,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 0 },
                          }}
                        />
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>
          )
        })}
      </Card>

      <Card colors={colors} style={{ marginTop: 14 }}>
        <Kicker colors={colors}>Jarvis — weekly summary</Kicker>
        {summary === null ? (
          <ActivityIndicator color={colors.glow} />
        ) : (
          <Text style={{ color: colors.ink, fontSize: 14.5, lineHeight: 22 }}>{summary}</Text>
        )}
      </Card>

      {op.todayWon && (
        <Card colors={colors} style={{ marginTop: 14, borderColor: colors.success }}>
          <Text style={{ color: colors.success, fontWeight: '800', fontSize: 15 }}>
            You got 1% better today.
          </Text>
          <Text style={{ color: colors.inkDim, fontSize: 13.5, marginTop: 4 }}>
            Every priority task, done. This is the compounding day.
          </Text>
        </Card>
      )}

      {state.dreamLifeStory ? (
        <>
          <Text style={[styles.section, { color: colors.inkFaint }]}>WHERE THIS IS GOING</Text>
          {state.dreamImage ? (
            <Image source={{ uri: state.dreamImage }} style={styles.dreamImg} />
          ) : (
            <DreamArt seed={state.dreamSeed} label="your future, rendered" />
          )}
          <Card colors={colors} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.ink, fontSize: 14.5, lineHeight: 23 }}>{state.dreamLifeStory}</Text>
          </Card>
        </>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  pad: { padding: 22, paddingBottom: 110 },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stat: { flex: 1, padding: 14 },
  big: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  lbl: { fontSize: 11, marginTop: 6, lineHeight: 15 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginTop: 24, marginBottom: 10 },
  dreamImg: { width: '100%', height: 220, borderRadius: 18 },
})
