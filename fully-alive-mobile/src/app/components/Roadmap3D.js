import React, { useRef, useEffect, useState } from 'react'
import { Animated, Dimensions, ScrollView, Text, View } from 'react-native'
import { C, F } from '../tokens'

// Enhanced 3D roadmap with parallax scrolling and CSS 3D effects
export default function Roadmap3D({ profile, selectedGoal = null }) {
  const scrollRef = useRef(new Animated.Value(0)).current
  const [scrollOffset, setScrollOffset] = useState(0)

  const goals = profile.goals || []
  const targetGoal = selectedGoal ? goals.find(g => g.id === selectedGoal) : goals[0]

  if (!targetGoal) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ ...F.body, color: C.text500 }}>
          No goals yet. Create one to see your 3D roadmap.
        </Text>
      </View>
    )
  }

  const milestones = targetGoal.milestones || []
  const totalProgress = targetGoal.progress || 0

  return (
    <ScrollView
      ref={scrollRef}
      scrollEventThrottle={16}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollRef } } }],
        {
          useNativeDriver: false,
          listener: event => {
            setScrollOffset(event.nativeEvent.contentOffset.y)
          },
        }
      )}
      style={{ flex: 1 }}
    >
      {/* Dream at the top */}
      <View
        style={{
          padding: 24,
          alignItems: 'center',
          backgroundColor: C.bg800,
          borderBottomWidth: 1,
          borderBottomColor: C.bg700,
          marginBottom: 32,
        }}
      >
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: C.violet,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 32 }}>✦</Text>
        </View>
        <Text style={{ ...F.h3, color: C.text, textAlign: 'center', marginBottom: 8 }}>
          {targetGoal.title}
        </Text>
        <Text style={{ ...F.small, color: C.text500, textAlign: 'center' }}>
          {targetGoal.description}
        </Text>
      </View>

      {/* Progress indicator */}
      <View style={{ paddingHorizontal: 20, marginBottom: 32 }}>
        <View
          style={{
            height: 8,
            backgroundColor: C.bg700,
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 8,
          }}
        >
          <View
            style={{
              height: '100%',
              width: `${totalProgress}%`,
              backgroundColor: C.green,
            }}
          />
        </View>
        <Text style={{ ...F.small, color: C.text500 }}>
          {totalProgress}% Complete
        </Text>
      </View>

      {/* Milestones as waypoints on the journey */}
      {milestones.map((milestone, index) => {
        const isCompleted = milestone.completed
        const isCurrent =
          index < (milestones.length - 1) &&
          !milestone.completed &&
          milestones.slice(0, index).every(m => m.completed)

        // Calculate parallax offset
        const parallaxOffset =
          scrollOffset > 0 ? (scrollOffset * (index + 1)) * 0.1 : 0

        return (
          <View
            key={milestone.id}
            style={{
              marginHorizontal: 20,
              marginBottom: 32,
              transform: [{ translateY: parallaxOffset }],
            }}
          >
            {/* Connector line */}
            {index < milestones.length - 1 && (
              <View
                style={{
                  position: 'absolute',
                  left: 29,
                  top: 60,
                  width: 2,
                  height: 150,
                  backgroundColor: isCompleted ? C.green : C.bg700,
                  zIndex: -1,
                }}
              />
            )}

            {/* Milestone checkpoint */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
              }}
            >
              {/* Node circle */}
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: isCompleted
                    ? C.green
                    : isCurrent
                      ? C.violet
                      : C.bg700,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 16,
                  borderWidth: isCurrent ? 2 : 0,
                  borderColor: C.amber,
                }}
              >
                {isCompleted ? (
                  <Text style={{ fontSize: 24 }}>✓</Text>
                ) : (
                  <Text
                    style={{
                      ...F.label,
                      color: C.bg,
                    }}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>

              {/* Content */}
              <View style={{ flex: 1, paddingTop: 8 }}>
                <Text style={{ ...F.label, color: C.text, marginBottom: 4 }}>
                  {milestone.horizon}
                </Text>
                <Text style={{ ...F.body, color: C.text, marginBottom: 8 }}>
                  {milestone.title}
                </Text>

                {milestone.description && (
                  <Text
                    style={{
                      ...F.small,
                      color: C.text500,
                      marginBottom: 8,
                    }}
                  >
                    {milestone.description}
                  </Text>
                )}

                {/* Steps */}
                {milestone.steps && milestone.steps.length > 0 && (
                  <View style={{ backgroundColor: C.bg700, borderRadius: 8, padding: 12 }}>
                    <Text style={{ ...F.tiny, color: C.text500, marginBottom: 8 }}>
                      STEPPING STONES
                    </Text>
                    {milestone.steps.map((step, stepIndex) => (
                      <View
                        key={step.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: stepIndex < milestone.steps.length - 1 ? 6 : 0,
                        }}
                      >
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: step.completed ? C.green : C.text500,
                            marginRight: 8,
                          }}
                        />
                        <Text
                          style={{
                            ...F.tiny,
                            color: step.completed ? C.text500 : C.text,
                            textDecorationLine: step.completed
                              ? 'line-through'
                              : 'none',
                          }}
                        >
                          {step.title}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        )
      })}

      {/* Summit / completion */}
      <View
        style={{
          padding: 24,
          marginHorizontal: 20,
          marginBottom: 40,
          alignItems: 'center',
          backgroundColor: totalProgress === 100 ? C.green + '20' : C.bg800,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: totalProgress === 100 ? C.green : C.bg700,
        }}
      >
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🏔</Text>
        <Text style={{ ...F.h4, color: C.text, textAlign: 'center', marginBottom: 8 }}>
          Achieve It: {targetGoal.title}
        </Text>
        {totalProgress === 100 ? (
          <Text style={{ ...F.body, color: C.green, textAlign: 'center' }}>
            🎉 You've reached the summit! Incredible work.
          </Text>
        ) : (
          <Text style={{ ...F.body, color: C.text500, textAlign: 'center' }}>
            Keep climbing. Every step gets you closer.
          </Text>
        )}
      </View>
    </ScrollView>
  )
}
