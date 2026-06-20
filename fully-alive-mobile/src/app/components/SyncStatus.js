import React from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { CheckCircle2, AlertCircle, Clock, Mail } from 'lucide-react-native'
import { C, F } from '../tokens'

// Shows sync status in Settings or as a banner
export default function SyncStatus({ isSyncing, lastSyncTime, pendingCount, hasError, awaitingConfirmation }) {
  // Unconfirmed signup — no session yet, so cloud backup is pending email confirmation.
  if (awaitingConfirmation) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' }}>
        <Mail size={16} color={C.amber} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.amber }}>Confirm your email to back up</Text>
          <Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint, marginTop: 2 }}>Your progress is saved on this device meanwhile</Text>
        </View>
      </View>
    )
  }

  if (isSyncing) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(99, 102, 241, 0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.3)' }}>
        <ActivityIndicator size="small" color={C.violet} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.violet }}>Syncing to cloud…</Text>
          <Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint, marginTop: 2 }}>Saving your progress</Text>
        </View>
      </View>
    )
  }

  if (hasError) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }}>
        <AlertCircle size={16} color="#ef4444" strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#ef4444' }}>Sync error</Text>
          <Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint, marginTop: 2 }}>Retrying automatically</Text>
        </View>
      </View>
    )
  }

  if (pendingCount > 0) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' }}>
        <Clock size={16} color={C.amber} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.amber }}>{pendingCount} change{pendingCount === 1 ? '' : 's'} queued</Text>
          <Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint, marginTop: 2 }}>Syncing when online</Text>
        </View>
      </View>
    )
  }

  if (lastSyncTime) {
    const now = new Date()
    const syncDate = new Date(lastSyncTime)
    const diffMs = now - syncDate
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    let timeAgo = 'just now'
    if (diffMins < 1) timeAgo = 'just now'
    else if (diffMins < 60) timeAgo = `${diffMins}m ago`
    else if (diffHours < 24) timeAgo = `${diffHours}h ago`
    else if (diffDays < 7) timeAgo = `${diffDays}d ago`
    else timeAgo = syncDate.toLocaleDateString()

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.3)' }}>
        <CheckCircle2 size={16} color="#22c55e" strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#22c55e' }}>All synced</Text>
          <Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint, marginTop: 2 }}>Last sync {timeAgo}</Text>
        </View>
      </View>
    )
  }

  return null
}
