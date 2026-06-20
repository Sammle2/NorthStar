import React, { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View, ActivityIndicator } from 'react-native'
import { ChevronRight, Plus, Trash2, CheckCircle2 } from 'lucide-react-native'
import { C, F } from '../tokens'
import aiService from '../../services/aiService'

// Goal creation flow: AI suggests goals, user edits/approves
export default function GoalCreation({ profile, onGoalsCreated, onCancel }) {
  const [step, setStep] = useState('entry') // entry | suggestions | review
  const [userGoals, setUserGoals] = useState([])
  const [newGoalText, setNewGoalText] = useState('')
  const [suggestedGoals, setSuggestedGoals] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch AI suggestions based on dream
  const generateSuggestions = async () => {
    if (userGoals.length === 0) {
      setError('Please add at least one goal first')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Call Claude API to suggest additional goals
      const suggestions = await aiService.suggestGoalsFromDream(profile.dreamDescription, 3)

      if (suggestions.length > 0) {
        setSuggestedGoals(
          suggestions.map(g => ({
            id: `suggested_${Date.now()}_${Math.random()}`,
            title: g.title,
            category: g.category,
            description: g.description || '',
            source: 'suggested',
            approved: false,
          }))
        )
        setStep('suggestions')
      } else {
        setError('Could not generate suggestions. Try again or continue with your goals.')
        setTimeout(() => setStep('review'), 2000)
      }
    } catch (err) {
      console.error('Failed to generate suggestions:', err)
      setError('Failed to generate suggestions. Continue with your goals.')
      setTimeout(() => setStep('review'), 2000)
    } finally {
      setLoading(false)
    }
  }

  const addUserGoal = () => {
    if (!newGoalText.trim()) return

    const newGoal = {
      id: `user_${Date.now()}`,
      title: newGoalText.trim(),
      category: 'general',
      description: '',
      source: 'user',
      approved: true,
    }

    setUserGoals([...userGoals, newGoal])
    setNewGoalText('')
  }

  const removeGoal = (id) => {
    setUserGoals(userGoals.filter(g => g.id !== id))
  }

  const toggleSuggestionApproval = (id) => {
    setSuggestedGoals(
      suggestedGoals.map(g =>
        g.id === id ? { ...g, approved: !g.approved } : g
      )
    )
  }

  const handleComplete = () => {
    const allGoals = [
      ...userGoals,
      ...suggestedGoals.filter(g => g.approved),
    ]

    if (allGoals.length === 0) {
      setError('Please add or approve at least one goal')
      return
    }

    onGoalsCreated(allGoals)
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {step === 'entry' && (
        <ScrollView style={{ flex: 1, padding: 20 }}>
          <Text style={{ ...F.h3, color: C.text, marginBottom: 10 }}>
            Let's Build Your Goals
          </Text>
          <Text style={{ ...F.body, color: C.text500, marginBottom: 20 }}>
            You've defined your dream. Now let's break it into specific goals you can work toward.
          </Text>

          <Text style={{ ...F.label, color: C.text, marginBottom: 12 }}>
            What goals are you pursuing or want to pursue?
          </Text>

          {/* List user's goals */}
          <View style={{ marginBottom: 20 }}>
            {userGoals.map(goal => (
              <View
                key={goal.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 12,
                  backgroundColor: C.bg800,
                  borderRadius: 8,
                  marginBottom: 8,
                  borderLeftWidth: 3,
                  borderLeftColor: C.amber,
                }}
              >
                <Text style={{ ...F.body, color: C.text, flex: 1 }}>{goal.title}</Text>
                <Pressable onPress={() => removeGoal(goal.id)}>
                  <Trash2 size={18} color={C.text500} />
                </Pressable>
              </View>
            ))}
          </View>

          {/* Add goal input */}
          <View style={{ marginBottom: 20 }}>
            <TextInput
              style={{
                padding: 12,
                backgroundColor: C.bg800,
                borderRadius: 8,
                color: C.text,
                borderWidth: 1,
                borderColor: C.violet,
                marginBottom: 8,
              }}
              placeholder="e.g., Run a marathon, Start a business"
              placeholderTextColor={C.text500}
              value={newGoalText}
              onChangeText={setNewGoalText}
            />
            <Pressable
              onPress={addUserGoal}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
                backgroundColor: C.amber,
                borderRadius: 8,
              }}
            >
              <Plus size={18} color={C.bg} />
              <Text style={{ ...F.label, color: C.bg, marginLeft: 6 }}>
                Add Goal
              </Text>
            </Pressable>
          </View>

          {error && (
            <Text style={{ ...F.small, color: '#ff6b6b', marginBottom: 12 }}>
              {error}
            </Text>
          )}

          {/* Next button */}
          <Pressable
            onPress={generateSuggestions}
            disabled={userGoals.length === 0 || loading}
            style={{
              paddingVertical: 14,
              backgroundColor: userGoals.length > 0 ? C.violet : C.bg700,
              borderRadius: 8,
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            {loading ? (
              <ActivityIndicator color={C.text} />
            ) : (
              <Text style={{ ...F.label, color: C.text }}>
                {userGoals.length > 0 ? 'Get AI Suggestions' : 'Add a goal to continue'}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={onCancel}
            style={{ paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ ...F.small, color: C.text500 }}>Skip for now</Text>
          </Pressable>
        </ScrollView>
      )}

      {step === 'suggestions' && (
        <ScrollView style={{ flex: 1, padding: 20 }}>
          <Text style={{ ...F.h3, color: C.text, marginBottom: 10 }}>
            AI Suggestions
          </Text>
          <Text style={{ ...F.body, color: C.text500, marginBottom: 20 }}>
            Based on your dream, here are some goals that might help. Tap to approve.
          </Text>

          {/* User's goals (already approved) */}
          <Text style={{ ...F.label, color: C.text, marginBottom: 10 }}>Your Goals</Text>
          {userGoals.map(goal => (
            <View
              key={goal.id}
              style={{
                padding: 12,
                backgroundColor: C.bg800,
                borderRadius: 8,
                marginBottom: 8,
                borderLeftWidth: 3,
                borderLeftColor: C.green,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CheckCircle2 size={18} color={C.green} />
                <Text style={{ ...F.body, color: C.text, marginLeft: 8, flex: 1 }}>
                  {goal.title}
                </Text>
              </View>
            </View>
          ))}

          {/* Suggested goals */}
          <Text style={{ ...F.label, color: C.text, marginBottom: 10, marginTop: 20 }}>
            Suggested Goals
          </Text>
          {suggestedGoals.map(goal => (
            <Pressable
              key={goal.id}
              onPress={() => toggleSuggestionApproval(goal.id)}
              style={{
                padding: 12,
                backgroundColor: goal.approved ? C.bg800 : C.bg700,
                borderRadius: 8,
                marginBottom: 8,
                borderLeftWidth: 3,
                borderLeftColor: goal.approved ? C.amber : C.text500,
              }}
            >
              <Text style={{ ...F.body, color: C.text }}>{goal.title}</Text>
              {goal.description && (
                <Text style={{ ...F.small, color: C.text500, marginTop: 4 }}>
                  {goal.description}
                </Text>
              )}
            </Pressable>
          ))}

          {error && (
            <Text style={{ ...F.small, color: '#ff6b6b', marginBottom: 12 }}>
              {error}
            </Text>
          )}

          {/* Complete button */}
          <Pressable
            onPress={handleComplete}
            style={{
              paddingVertical: 14,
              backgroundColor: C.violet,
              borderRadius: 8,
              alignItems: 'center',
              marginBottom: 12,
              marginTop: 20,
            }}
          >
            <Text style={{ ...F.label, color: C.text }}>Create These Goals</Text>
          </Pressable>

          <Pressable
            onPress={() => setStep('entry')}
            style={{ paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ ...F.small, color: C.text500 }}>Back</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  )
}
