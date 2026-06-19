import React, { useEffect, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native'
import { ChevronDown, ChevronUp, Plus, Trash2, RefreshCw, Save } from 'lucide-react-native'
import { C, F } from '../tokens'
import aiService from '../../services/aiService'

// Edit milestones and their stepping stones
export default function MilestonesEditor({
  visible,
  goal,
  onSave,
  onCancel,
}) {
  const [milestones, setMilestones] = useState([])
  const [expandedMs, setExpandedMs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [newStepText, setNewStepText] = useState({})

  useEffect(() => {
    if (visible && goal) {
      setMilestones(goal.milestones || [])
      setError(null)
    }
  }, [visible, goal])

  const updateMilestoneTitle = (msIndex, title) => {
    const updated = [...milestones]
    updated[msIndex].title = title
    setMilestones(updated)
  }

  const updateMilestoneDescription = (msIndex, description) => {
    const updated = [...milestones]
    updated[msIndex].description = description
    setMilestones(updated)
  }

  const addStepToMilestone = (msIndex) => {
    if (!newStepText[msIndex]?.trim()) return

    const updated = [...milestones]
    const newStep = {
      id: `step_${Date.now()}_${Math.random()}`,
      title: newStepText[msIndex].trim(),
      completed: false,
      order_index: (updated[msIndex].steps?.length || 0) + 1,
      created_at: new Date().toISOString(),
    }

    if (!updated[msIndex].steps) updated[msIndex].steps = []
    updated[msIndex].steps.push(newStep)
    setMilestones(updated)

    const newText = { ...newStepText }
    delete newText[msIndex]
    setNewStepText(newText)
  }

  const removeStep = (msIndex, stepId) => {
    const updated = [...milestones]
    updated[msIndex].steps = updated[msIndex].steps.filter(s => s.id !== stepId)
    setMilestones(updated)
  }

  const regenerateMilestones = async () => {
    setLoading(true)
    setError(null)

    try {
      const suggestions = await aiService.suggestMilestonesForGoal(
        goal.title,
        goal.description,
        goal.category
      )

      if (suggestions && suggestions.length === 3) {
        // Update milestone titles
        const updated = milestones.map((ms, i) => ({
          ...ms,
          title: suggestions[i]?.title || ms.title,
          description: suggestions[i]?.description || ms.description,
        }))
        setMilestones(updated)
      }
    } catch (err) {
      console.error('Failed to regenerate milestones:', err)
      setError('Could not regenerate. Try again or edit manually.')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = () => {
    // Validate milestones
    if (!milestones.every(ms => ms.title?.trim())) {
      setError('All milestones must have a title')
      return
    }

    const updated = {
      ...goal,
      milestones: milestones.map(ms => ({
        ...ms,
        updated_at: new Date().toISOString(),
      })),
    }

    onSave(updated)
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onCancel}
      transparent={true}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          paddingTop: 40,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingBottom: 20,
            borderBottomWidth: 1,
            borderBottomColor: C.bg700,
          }}
        >
          <Text style={{ ...F.h3, color: C.text }}>
            Edit Milestones
          </Text>
          <Pressable onPress={onCancel}>
            <Text style={{ ...F.label, color: C.text500 }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }}>
          <Text style={{ ...F.body, color: C.text500, marginBottom: 20 }}>
            {goal?.title}
          </Text>

          {/* Milestones */}
          {milestones.map((milestone, msIndex) => (
            <View key={milestone.id} style={{ marginBottom: 16 }}>
              <Pressable
                onPress={() =>
                  setExpandedMs(expandedMs === msIndex ? null : msIndex)
                }
                style={{
                  padding: 12,
                  backgroundColor: C.bg800,
                  borderRadius: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderLeftWidth: 3,
                  borderLeftColor: C.violet,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ ...F.label, color: C.text }}>
                    {milestone.horizon}
                  </Text>
                  <Text style={{ ...F.small, color: C.text500, marginTop: 2 }}>
                    {milestone.title || 'Untitled'}
                  </Text>
                </View>
                {expandedMs === msIndex ? (
                  <ChevronUp size={18} color={C.text500} />
                ) : (
                  <ChevronDown size={18} color={C.text500} />
                )}
              </Pressable>

              {/* Expanded view */}
              {expandedMs === msIndex && (
                <View style={{ marginTop: 12, paddingLeft: 12 }}>
                  {/* Title input */}
                  <Text style={{ ...F.label, color: C.text, marginBottom: 6 }}>
                    Milestone Title
                  </Text>
                  <TextInput
                    style={{
                      padding: 10,
                      backgroundColor: C.bg700,
                      borderRadius: 6,
                      color: C.text,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: C.violet,
                    }}
                    value={milestone.title}
                    onChangeText={(title) =>
                      updateMilestoneTitle(msIndex, title)
                    }
                    placeholder="Milestone title"
                    placeholderTextColor={C.text500}
                  />

                  {/* Description input */}
                  <Text style={{ ...F.label, color: C.text, marginBottom: 6 }}>
                    Description
                  </Text>
                  <TextInput
                    style={{
                      padding: 10,
                      backgroundColor: C.bg700,
                      borderRadius: 6,
                      color: C.text,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: C.violet,
                      minHeight: 60,
                      textAlignVertical: 'top',
                    }}
                    value={milestone.description || ''}
                    onChangeText={(desc) =>
                      updateMilestoneDescription(msIndex, desc)
                    }
                    placeholder="What success looks like..."
                    placeholderTextColor={C.text500}
                    multiline
                  />

                  {/* Stepping stones */}
                  <Text style={{ ...F.label, color: C.text, marginBottom: 8 }}>
                    Stepping Stones
                  </Text>

                  {(milestone.steps || []).map((step, stepIndex) => (
                    <View
                      key={step.id}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 8,
                        backgroundColor: C.bg700,
                        borderRadius: 6,
                        marginBottom: 6,
                      }}
                    >
                      <Text
                        style={{
                          ...F.small,
                          color: C.text,
                          flex: 1,
                          textDecorationLine: step.completed
                            ? 'line-through'
                            : 'none',
                        }}
                      >
                        {step.title}
                      </Text>
                      <Pressable onPress={() => removeStep(msIndex, step.id)}>
                        <Trash2 size={14} color={C.text500} />
                      </Pressable>
                    </View>
                  ))}

                  {/* Add step input */}
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                    <TextInput
                      style={{
                        flex: 1,
                        padding: 10,
                        backgroundColor: C.bg700,
                        borderRadius: 6,
                        color: C.text,
                        borderWidth: 1,
                        borderColor: C.amber,
                      }}
                      placeholder="Add a stepping stone..."
                      placeholderTextColor={C.text500}
                      value={newStepText[msIndex] || ''}
                      onChangeText={(text) =>
                        setNewStepText({
                          ...newStepText,
                          [msIndex]: text,
                        })
                      }
                    />
                    <Pressable
                      onPress={() => addStepToMilestone(msIndex)}
                      style={{
                        paddingHorizontal: 12,
                        justifyContent: 'center',
                        backgroundColor: C.amber,
                        borderRadius: 6,
                      }}
                    >
                      <Plus size={18} color={C.bg} />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          ))}

          {error && (
            <Text style={{ ...F.small, color: '#ff6b6b', marginBottom: 12 }}>
              {error}
            </Text>
          )}

          {/* Regenerate button */}
          <Pressable
            onPress={regenerateMilestones}
            disabled={loading}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              backgroundColor: C.bg800,
              borderRadius: 8,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: C.violet,
            }}
          >
            {loading ? (
              <ActivityIndicator color={C.text} />
            ) : (
              <>
                <RefreshCw size={16} color={C.text} />
                <Text style={{ ...F.label, color: C.text, marginLeft: 6 }}>
                  Generate AI Suggestions
                </Text>
              </>
            )}
          </Pressable>

          {/* Save button */}
          <Pressable
            onPress={handleSave}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 14,
              backgroundColor: C.violet,
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            <Save size={16} color={C.bg} />
            <Text style={{ ...F.label, color: C.bg, marginLeft: 6 }}>
              Save Milestones
            </Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            style={{ paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ ...F.small, color: C.text500 }}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}
