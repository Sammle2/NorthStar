import React, { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { CheckCircle2, Circle, Clock, Zap } from 'lucide-react-native'
import { C, F } from '../tokens'
import dailyActionGenerator from '../../services/dailyActionGenerator'

// Display and manage today's daily actions
export default function DailyActionsPanel({
  profile,
  onUpdate,
}) {
  const [todaysActions, setTodaysActions] = useState([])
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const actions = dailyActionGenerator.getTodaysActions(profile.dailyActions || [])
    setTodaysActions(actions)

    const p = dailyActionGenerator.calculateDailyProgress(actions)
    setProgress(p)
  }, [profile.dailyActions])

  const toggleAction = (actionId) => {
    const updated = (profile.dailyActions || []).map(a =>
      a.id === actionId
        ? {
            ...a,
            completed: !a.completed,
            completed_at: !a.completed ? new Date().toISOString() : null,
          }
        : a
    )

    onUpdate({ ...profile, dailyActions: updated })
  }

  if (todaysActions.length === 0) {
    return (
      <View
        style={{
          backgroundColor: C.bg800,
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <Text style={{ ...F.body, color: C.text500 }}>
          No actions for today. Create some to get started!
        </Text>
      </View>
    )
  }

  const allComplete = todaysActions.every(a => a.completed)

  return (
    <View style={{ marginBottom: 16 }}>
      {/* Header with progress */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ ...F.h4, color: C.text }}>Today's Actions</Text>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: progress > 0 ? C.violet : C.bg800,
            borderRadius: 6,
          }}
        >
          <Text style={{ ...F.small, color: C.text }}>
            {progress}% complete
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View
        style={{
          height: 4,
          backgroundColor: C.bg700,
          borderRadius: 2,
          marginBottom: 12,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: allComplete ? C.green : C.violet,
          }}
        />
      </View>

      {/* Actions list */}
      {todaysActions.map((action, index) => (
        <Pressable
          key={action.id}
          onPress={() => toggleAction(action.id)}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            padding: 12,
            backgroundColor: C.bg800,
            borderRadius: 8,
            marginBottom: 8,
            borderLeftWidth: 3,
            borderLeftColor: action.completed ? C.green : C.amber,
          }}
        >
          {/* Checkbox */}
          <View style={{ marginRight: 12, marginTop: 2 }}>
            {action.completed ? (
              <CheckCircle2 size={20} color={C.green} />
            ) : (
              <Circle size={20} color={C.text500} />
            )}
          </View>

          {/* Action content */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                ...F.body,
                color: action.completed ? C.text500 : C.text,
                textDecorationLine: action.completed ? 'line-through' : 'none',
              }}
            >
              {action.title}
            </Text>
            {action.description && (
              <Text
                style={{
                  ...F.small,
                  color: C.text500,
                  marginTop: 4,
                }}
              >
                {action.description}
              </Text>
            )}
          </View>

          {/* Duration estimate */}
          <View style={{ marginLeft: 8, alignItems: 'flex-end' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <Clock size={12} color={C.text500} />
              <Text style={{ ...F.tiny, color: C.text500, marginLeft: 4 }}>
                ~30m
              </Text>
            </View>
          </View>
        </Pressable>
      ))}

      {/* Motivational message */}
      {todaysActions.length > 0 && (
        <View
          style={{
            paddingVertical: 12,
            paddingHorizontal: 12,
            backgroundColor: allComplete ? C.bg800 : 'transparent',
            borderRadius: 8,
            marginTop: 8,
            borderLeftWidth: allComplete ? 3 : 0,
            borderLeftColor: C.green,
          }}
        >
          <Text style={{ ...F.small, color: allComplete ? C.green : C.text500 }}>
            {allComplete
              ? "🎉 You crushed today! Way to go!"
              : `Keep going! ${todaysActions.filter(a => a.completed).length} of ${todaysActions.length} done.`}
          </Text>
        </View>
      )}
    </View>
  )
}
