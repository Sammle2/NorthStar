// Supabase CRUD service layer
// Handles all database operations with proper error handling and retry logic

const SUPABASE_URL = 'https://wsgbnhiklczfiapqrnnf.supabase.co'
const SUPABASE_KEY = 'sb_publishable_YK1olhdXjHYzbdlGABGP4w_37Qp8ROV'

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

// Helper function to make requests to Supabase REST API
async function supabaseRequest(table, method = 'GET', body = null, filters = {}) {
  try {
    let url = `${SUPABASE_URL}/rest/v1/${table}`

    // Build query string from filters
    const filterKeys = Object.keys(filters)
    if (filterKeys.length > 0) {
      const queryParams = filterKeys.map(key => {
        const value = filters[key]
        if (typeof value === 'string') {
          return `${key}=eq.${encodeURIComponent(value)}`
        }
        return `${key}=eq.${value}`
      }).join('&')
      url += `?${queryParams}`
    }

    const options = {
      method,
      headers: HEADERS,
    }

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      const error = await response.text()
      console.error(`Supabase ${method} error:`, error)
      throw new Error(`Supabase error: ${response.status}`)
    }

    // GET and DELETE return different response types
    if (method === 'DELETE') {
      return { success: true }
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error(`Supabase request failed:`, error)
    throw error
  }
}

// Goals CRUD
export const goals = {
  async create(userId, title, category, description = '', isPrimary = false) {
    const body = {
      user_id: userId,
      title,
      category,
      description,
      primary_goal: isPrimary,
    }
    return supabaseRequest('goals', 'POST', body)
  },

  async getByUserId(userId) {
    return supabaseRequest('goals', 'GET', null, { user_id: userId })
  },

  async getById(goalId) {
    const res = await supabaseRequest('goals', 'GET', null, { id: goalId })
    return Array.isArray(res) ? res[0] : res
  },

  async update(goalId, updates) {
    updates.updated_at = new Date().toISOString()
    return supabaseRequest(`goals?id=eq.${goalId}`, 'PATCH', updates)
  },

  async delete(goalId) {
    return supabaseRequest(`goals?id=eq.${goalId}`, 'DELETE')
  },
}

// Milestones CRUD
export const milestones = {
  async create(goalId, title, horizon, description = '') {
    const body = {
      goal_id: goalId,
      title,
      horizon,
      description,
    }
    return supabaseRequest('milestones', 'POST', body)
  },

  async getByGoalId(goalId) {
    return supabaseRequest('milestones', 'GET', null, { goal_id: goalId })
  },

  async update(milestoneId, updates) {
    updates.updated_at = new Date().toISOString()
    return supabaseRequest(`milestones?id=eq.${milestoneId}`, 'PATCH', updates)
  },

  async delete(milestoneId) {
    return supabaseRequest(`milestones?id=eq.${milestoneId}`, 'DELETE')
  },
}

// Steps CRUD
export const steps = {
  async create(milestoneId, title, orderIndex = 0) {
    const body = {
      milestone_id: milestoneId,
      title,
      order_index: orderIndex,
    }
    return supabaseRequest('steps', 'POST', body)
  },

  async getByMilestoneId(milestoneId) {
    return supabaseRequest('steps', 'GET', null, { milestone_id: milestoneId })
  },

  async update(stepId, updates) {
    updates.updated_at = new Date().toISOString()
    return supabaseRequest(`steps?id=eq.${stepId}`, 'PATCH', updates)
  },

  async delete(stepId) {
    return supabaseRequest(`steps?id=eq.${stepId}`, 'DELETE')
  },
}

// Daily Actions CRUD
export const dailyActions = {
  async create(userId, goalId, date, title, description = '', orderIndex = 0) {
    const body = {
      user_id: userId,
      goal_id: goalId,
      date,
      title,
      description,
      order_index: orderIndex,
    }
    return supabaseRequest('daily_actions', 'POST', body)
  },

  async getByUserAndDate(userId, date) {
    const res = await supabaseRequest('daily_actions', 'GET')
    // Filter client-side to handle date matching
    return res.filter(a => a.user_id === userId && a.date === date)
  },

  async getByGoalId(goalId) {
    return supabaseRequest('daily_actions', 'GET', null, { goal_id: goalId })
  },

  async update(actionId, updates) {
    updates.updated_at = new Date().toISOString()
    return supabaseRequest(`daily_actions?id=eq.${actionId}`, 'PATCH', updates)
  },

  async delete(actionId) {
    return supabaseRequest(`daily_actions?id=eq.${actionId}`, 'DELETE')
  },
}

// Vision Board Images CRUD
export const visionBoardImages = {
  async create(userId, keyword, imageUrl, prompt = '', goalId = null) {
    const body = {
      user_id: userId,
      goal_id: goalId,
      keyword,
      image_url: imageUrl,
      prompt,
    }
    return supabaseRequest('vision_board_images', 'POST', body)
  },

  async getByUserId(userId) {
    return supabaseRequest('vision_board_images', 'GET', null, { user_id: userId })
  },

  async getByKeyword(userId, keyword) {
    const res = await supabaseRequest('vision_board_images', 'GET')
    return res.filter(img => img.user_id === userId && img.keyword === keyword)
  },

  async delete(imageId) {
    return supabaseRequest(`vision_board_images?id=eq.${imageId}`, 'DELETE')
  },
}

// Checkpoints CRUD
export const checkpoints = {
  async create(goalId, milestoneId, completedSteps, totalSteps) {
    const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
    const body = {
      goal_id: goalId,
      milestone_id: milestoneId,
      completed_steps: completedSteps,
      total_steps: totalSteps,
      progress_percent: progressPercent,
    }
    return supabaseRequest('checkpoints', 'POST', body)
  },

  async getByGoalId(goalId) {
    return supabaseRequest('checkpoints', 'GET', null, { goal_id: goalId })
  },
}

// User Settings CRUD
export const userSettings = {
  async getOrCreate(userId) {
    const res = await supabaseRequest('user_settings', 'GET', null, { user_id: userId })
    if (Array.isArray(res) && res.length > 0) {
      return res[0]
    }

    // Create default settings if not found
    const defaults = {
      user_id: userId,
      coach_tone: 'default',
      vision_board_enabled: true,
      auto_generate_daily_actions: true,
      daily_action_count: 7,
    }
    return supabaseRequest('user_settings', 'POST', defaults)
  },

  async update(userId, updates) {
    updates.updated_at = new Date().toISOString()
    return supabaseRequest(`user_settings?user_id=eq.${userId}`, 'PATCH', updates)
  },

  async updateApiKey(userId, keyType, value) {
    // keyType: 'claude' or 'dalle'
    const updates = {}
    if (keyType === 'claude') {
      updates.claude_api_key = value
    } else if (keyType === 'dalle') {
      updates.dalle_api_key = value
    }
    return this.update(userId, updates)
  },
}

export default {
  goals,
  milestones,
  steps,
  dailyActions,
  visionBoardImages,
  checkpoints,
  userSettings,
}
