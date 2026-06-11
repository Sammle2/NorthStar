import React, { useRef } from 'react'
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native'
import { catColor } from '../theme'

// Swipe right → complete, swipe left → skip. Falls back to tap targets too.
export default function TaskCard({ task, colors, onComplete, onSkip }) {
  const x = useRef(new Animated.Value(0)).current

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, { dx: x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 90) {
          Animated.timing(x, { toValue: 400, duration: 180, useNativeDriver: false }).start(() => {
            x.setValue(0)
            onComplete()
          })
        } else if (g.dx < -90) {
          Animated.timing(x, { toValue: -400, duration: 180, useNativeDriver: false }).start(() => {
            x.setValue(0)
            onSkip()
          })
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: false, friction: 7 }).start()
        }
      },
    }),
  ).current

  const done = task.completed
  const skipped = task.skipped

  // Hints only fade in while the card is actually being swiped —
  // otherwise they bleed through the translucent card surface.
  const completeHint = x.interpolate({ inputRange: [0, 60], outputRange: [0, 1], extrapolate: 'clamp' })
  const skipHint = x.interpolate({ inputRange: [-60, 0], outputRange: [1, 0], extrapolate: 'clamp' })

  return (
    <View style={styles.wrap}>
      <View style={[styles.hintRow]}>
        <Animated.Text style={[styles.hint, { color: colors.success, opacity: completeHint }]}>
          ✓ complete
        </Animated.Text>
        <Animated.Text style={[styles.hint, { color: colors.inkFaint, opacity: skipHint }]}>
          skip →
        </Animated.Text>
      </View>
      <Animated.View
        {...pan.panHandlers}
        style={[
          styles.card,
          {
            backgroundColor: colors.raised,
            borderColor: done ? colors.success : skipped ? colors.line : colors.line,
            transform: [{ translateX: x }],
            opacity: done || skipped ? 0.55 : 1,
          },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: catColor(task.category) }]} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.ink,
              fontSize: 15,
              fontWeight: '600',
              textDecorationLine: done ? 'line-through' : 'none',
            }}
          >
            {task.title}
          </Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 2 }}>
            {task.category}
            {task.priority === 'high' ? ' · priority' : ''}
            {skipped ? ' · skipped' : ''}
          </Text>
        </View>
        {!done && !skipped && (
          <>
            <Text style={[styles.tapBtn, { color: colors.success }]} onPress={onComplete}>
              ✓
            </Text>
            <Text style={[styles.tapBtn, { color: colors.inkFaint }]} onPress={onSkip}>
              –
            </Text>
          </>
        )}
        {done && <Text style={{ color: colors.success, fontSize: 17 }}>✓</Text>}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10, position: 'relative' },
  hintRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  hint: { fontSize: 12, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  tapBtn: { fontSize: 17, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4 },
})
