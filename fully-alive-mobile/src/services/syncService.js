// Sync Service
// Handles offline sync queue and conflict resolution with Supabase

import AsyncStorage from '@react-native-async-storage/async-storage'

const SYNC_QUEUE_KEY = 'sync_queue_v1'
const LAST_SYNC_KEY = 'last_sync_timestamp'

// Sync queue entry structure
// {
//   id: uuid,
//   operation: 'CREATE' | 'UPDATE' | 'DELETE',
//   table: 'goals' | 'milestones' | 'steps' | 'daily_actions' | 'vision_board_images',
//   data: { ... },
//   timestamp: ISO timestamp,
//   synced: boolean,
//   retries: number,
// }

// Add operation to sync queue
export async function queueOperation(operation, table, data) {
  try {
    const queue = (await AsyncStorage.getItem(SYNC_QUEUE_KEY)) || '[]'
    const items = JSON.parse(queue)

    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      operation,
      table,
      data,
      timestamp: new Date().toISOString(),
      synced: false,
      retries: 0,
    }

    items.push(entry)
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(items))

    return entry.id
  } catch (error) {
    console.error('Failed to queue operation:', error)
    throw error
  }
}

// Get pending sync queue
export async function getPendingQueue() {
  try {
    const queue = (await AsyncStorage.getItem(SYNC_QUEUE_KEY)) || '[]'
    const items = JSON.parse(queue)
    return items.filter(item => !item.synced)
  } catch (error) {
    console.error('Failed to get pending queue:', error)
    return []
  }
}

// Mark operation as synced
export async function markOperationSynced(operationId) {
  try {
    const queue = (await AsyncStorage.getItem(SYNC_QUEUE_KEY)) || '[]'
    const items = JSON.parse(queue)

    const updated = items.map(item =>
      item.id === operationId ? { ...item, synced: true, retries: 0 } : item
    )

    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Failed to mark operation synced:', error)
    throw error
  }
}

// Increment retry count
export async function incrementRetry(operationId) {
  try {
    const queue = (await AsyncStorage.getItem(SYNC_QUEUE_KEY)) || '[]'
    const items = JSON.parse(queue)

    const updated = items.map(item =>
      item.id === operationId ? { ...item, retries: (item.retries || 0) + 1 } : item
    )

    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Failed to increment retry:', error)
    throw error
  }
}

// Remove operation from queue (after max retries)
export async function removeOperation(operationId) {
  try {
    const queue = (await AsyncStorage.getItem(SYNC_QUEUE_KEY)) || '[]'
    const items = JSON.parse(queue)

    const filtered = items.filter(item => item.id !== operationId)
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered))
  } catch (error) {
    console.error('Failed to remove operation:', error)
    throw error
  }
}

// Conflict resolution: timestamp-based winner
export function resolveConflict(localData, remoteData) {
  // If either doesn't have timestamp, prefer local
  if (!localData.updated_at || !remoteData.updated_at) {
    return localData
  }

  const localTime = new Date(localData.updated_at).getTime()
  const remoteTime = new Date(remoteData.updated_at).getTime()

  // Most recent change wins
  return localTime > remoteTime ? localData : remoteData
}

// Get last successful sync time
export async function getLastSyncTime() {
  try {
    const timestamp = await AsyncStorage.getItem(LAST_SYNC_KEY)
    return timestamp ? new Date(timestamp) : null
  } catch (error) {
    console.error('Failed to get last sync time:', error)
    return null
  }
}

// Update last sync time
export async function setLastSyncTime() {
  try {
    const timestamp = new Date().toISOString()
    await AsyncStorage.setItem(LAST_SYNC_KEY, timestamp)
  } catch (error) {
    console.error('Failed to set last sync time:', error)
    throw error
  }
}

// Check if sync is needed (last sync was > 5 minutes ago)
export async function shouldSync() {
  try {
    const lastSync = await getLastSyncTime()

    if (!lastSync) return true

    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

    return lastSync < fiveMinutesAgo
  } catch (error) {
    console.error('Failed to check sync status:', error)
    return false
  }
}

// Batch sync operations to Supabase (should be called by app periodically)
export async function syncPendingOperations(supabaseService) {
  try {
    const pending = await getPendingQueue()

    if (pending.length === 0) {
      await setLastSyncTime()
      return { synced: 0, failed: 0 }
    }

    let synced = 0
    let failed = 0

    for (const operation of pending) {
      try {
        const { table, operation: op, data } = operation

        // Route to appropriate Supabase service
        if (table === 'goals' && op === 'CREATE') {
          await supabaseService.goals.create(
            data.user_id,
            data.title,
            data.category,
            data.description,
            data.primary_goal
          )
        } else if (table === 'goals' && op === 'UPDATE') {
          await supabaseService.goals.update(data.id, data)
        } else if (table === 'milestones' && op === 'CREATE') {
          await supabaseService.milestones.create(
            data.goal_id,
            data.title,
            data.horizon,
            data.description
          )
        } else if (table === 'milestones' && op === 'UPDATE') {
          await supabaseService.milestones.update(data.id, data)
        } else if (table === 'steps' && op === 'CREATE') {
          await supabaseService.steps.create(data.milestone_id, data.title, data.order_index)
        } else if (table === 'steps' && op === 'UPDATE') {
          await supabaseService.steps.update(data.id, data)
        } else if (table === 'daily_actions' && op === 'CREATE') {
          await supabaseService.dailyActions.create(
            data.user_id,
            data.goal_id,
            data.date,
            data.title,
            data.description,
            data.order_index
          )
        } else if (table === 'daily_actions' && op === 'UPDATE') {
          await supabaseService.dailyActions.update(data.id, data)
        }

        await markOperationSynced(operation.id)
        synced++
      } catch (error) {
        console.error(`Failed to sync ${operation.table} operation:`, error)

        // Retry up to 3 times
        if (operation.retries < 3) {
          await incrementRetry(operation.id)
          failed++
        } else {
          // Max retries exceeded, remove from queue
          await removeOperation(operation.id)
          failed++
        }
      }
    }

    await setLastSyncTime()
    return { synced, failed }
  } catch (error) {
    console.error('Failed to sync pending operations:', error)
    throw error
  }
}

export default {
  queueOperation,
  getPendingQueue,
  markOperationSynced,
  incrementRetry,
  removeOperation,
  resolveConflict,
  getLastSyncTime,
  setLastSyncTime,
  shouldSync,
  syncPendingOperations,
}
