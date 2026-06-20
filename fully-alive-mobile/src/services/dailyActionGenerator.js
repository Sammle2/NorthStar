// Daily Action Generator Service
// Automatically generates 7-14 daily actions from milestones

import aiService from './aiService'

// Generate daily actions for a milestone
export async function generateDailyActionsForMilestone(
  goal,
  milestoneIndex,
  coachTone = 'default'
) {
  const milestone = goal.milestones?.[milestoneIndex]
  if (!milestone) {
    throw new Error('Milestone not found')
  }

  try {
    const actions = await aiService.generateDailyActionsForMilestone(
      milestone.title,
      goal.title,
      7, // Start with 7 actions
      coachTone
    )

    return actions.map((action, index) => ({
      id: `action_${Date.now()}_${index}`,
      goal_id: goal.id,
      milestone_id: milestone.id,
      title: action.title,
      description: action.description || '',
      assigned_date: new Date().toISOString().split('T')[0],
      completed: false,
      order_index: index,
      created_at: new Date().toISOString(),
    }))
  } catch (error) {
    console.error('Failed to generate daily actions:', error)
    throw error
  }
}

// Get today's actions for a user
export function getTodaysActions(dailyActions, goal = null) {
  const today = new Date().toISOString().split('T')[0]

  return (dailyActions || []).filter(action => {
    const actionDate = action.assigned_date?.split('T')[0]
    const matchesDate = actionDate === today
    const matchesGoal = !goal || action.goal_id === goal.id

    return matchesDate && matchesGoal
  })
}

// Get actions for a specific date
export function getActionsByDate(dailyActions, date, goal = null) {
  return (dailyActions || []).filter(action => {
    const actionDate = action.assigned_date?.split('T')[0]
    const matchesDate = actionDate === date
    const matchesGoal = !goal || action.goal_id === goal.id

    return matchesDate && matchesGoal
  })
}

// Get actions for a goal
export function getActionsByGoal(dailyActions, goalId) {
  return (dailyActions || []).filter(action => action.goal_id === goalId)
}

// Calculate progress for today
export function calculateDailyProgress(todaysActions) {
  if (todaysActions.length === 0) return 0

  const completed = todaysActions.filter(a => a.completed).length
  return Math.round((completed / todaysActions.length) * 100)
}

// Check if all today's actions are complete
export function allActionsComplete(todaysActions) {
  return (
    todaysActions.length > 0 && todaysActions.every(action => action.completed)
  )
}

// Generate motivational message based on progress
export function getProgressMessage(progress, coachTone = 'default') {
  const messages = {
    tough: {
      0: "Time to get to work. You've got this.",
      25: "Good start. Keep the momentum going.",
      50: "Halfway there. No time to slow down.",
      75: "Almost done. Finish strong.",
      100: "That's how it's done. You own today.",
    },
    default: {
      0: "Ready to make today count?",
      25: "Nice! Keep going.",
      50: "You're halfway there! Keep it up.",
      75: "Almost done! Push through.",
      100: "All done! You crushed today.",
    },
    gentle: {
      0: "Take it one step at a time. You've got this.",
      25: "You're doing great. Keep going at your pace.",
      50: "You're making real progress. Nice work.",
      75: "You're so close. Just a bit more.",
      100: "You did it! Be proud of yourself today.",
    },
  }

  const tone = messages[coachTone] || messages.default
  const progressLevel =
    progress === 0
      ? 0
      : progress < 50
        ? 25
        : progress < 100
          ? 50
          : progress === 100
            ? 100
            : 75

  return tone[progressLevel]
}

// Estimate completion time for an action
export function estimateActionDuration(action) {
  // Default to 30 minutes for actions
  const keywords = {
    quick: 10,
    fast: 10,
    short: 15,
    long: 60,
    session: 45,
    deep: 120,
  }

  const title = (action.title || '').toLowerCase()
  for (const [keyword, duration] of Object.entries(keywords)) {
    if (title.includes(keyword)) {
      return duration
    }
  }

  return 30 // Default
}

export default {
  generateDailyActionsForMilestone,
  getTodaysActions,
  getActionsByDate,
  getActionsByGoal,
  calculateDailyProgress,
  allActionsComplete,
  getProgressMessage,
  estimateActionDuration,
}
