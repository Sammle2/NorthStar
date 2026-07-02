import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { AlertTriangle, Check, X, Pencil, Globe, Lock } from 'lucide-react-native'
import { C, F } from '../tokens'
import CoachAvatar from '../components/CoachAvatar'
import Avatar from '../components/Avatar'
import EditProfile from '../components/EditProfile'
import SyncStatus from '../components/SyncStatus'
import { capName } from '../aiEngine'
import { deleteAccount } from '../../services/accountService'

const TONES = [
  { id: 'tough', label: 'Tough Love', desc: 'No BS, high expectations', emoji: '💪' },
  { id: 'default', label: 'Balanced', desc: 'Honest and encouraging', emoji: '⚡' },
  { id: 'gentle', label: 'Supportive', desc: 'Warm, patient, kind', emoji: '🌱' },
]

// Settings — rename the Coach, switch its style (which changes its whole voice),
// edit your own name, manage API keys, or start over. Full-screen overlay.
export default function Settings({ profile, onUpdate, onClose, onReset, onSignOut, onDeleteAccount, isSyncing, lastSyncAt, syncError, awaitingConfirmation }) {
  const [name, setName] = useState(profile.name)
  const [coachName, setCoachName] = useState(profile.coachName || 'Nova')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)

  const runDeleteAccount = async () => {
    setDeleting(true)
    setDeleteError(null)
    const { error } = await deleteAccount()
    if (error) {
      setDeleteError(error)
      setDeleting(false)
      return
    }
    setDeleting(false)
    setConfirmingDelete(false)
    onDeleteAccount?.()
  }

  const commitName = () => onUpdate({ ...profile, name: capName(name) || profile.name })
  // Coach name persists live (no transform), so it propagates immediately.
  const changeCoach = (t) => {
    setCoachName(t)
    onUpdate({ ...profile, coachName: t.trim() || 'Nova' })
  }
  const setTone = (id) => onUpdate({ ...profile, coachTone: id })

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 200 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <Text style={{ fontFamily: F.display, fontSize: 26, color: C.ink, letterSpacing: 1.4 }}>SETTINGS</Text>
          <Pressable onPress={onClose} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineMid }}>
            <X size={18} color={C.dim} strokeWidth={2.2} />
          </Pressable>
        </View>

        {/* Coach preview */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <CoachAvatar size={48} />
          <View>
            <Text style={{ fontFamily: F.display, fontSize: 15, color: C.ink, letterSpacing: 1.2 }}>{(coachName || 'Nova').toUpperCase()}</Text>
            <Text style={{ fontFamily: F.body, fontSize: 12, color: C.green, marginTop: 2 }}>
              {(TONES.find((t) => t.id === profile.coachTone) || TONES[1]).label} mode
            </Text>
          </View>
        </View>

        {/* Profile — name, photo, handle, bio, and public/private all live here */}
        <Section label="PROFILE">
          <Pressable onPress={() => setEditingProfile(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, borderWidth: 1, borderColor: C.lineMid, backgroundColor: C.card, padding: 14 }}>
            <Avatar url={profile.avatarUrl} name={profile.name} username={profile.username} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 15.5, color: C.ink }}>{profile.name || 'Your name'}</Text>
              <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.violet, marginTop: 1 }}>
                {profile.username ? `@${profile.username}` : 'set a username'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
                {(profile.visibility || 'private') === 'public'
                  ? <Globe size={11} color={C.faint} strokeWidth={2} />
                  : <Lock size={11} color={C.faint} strokeWidth={2} />}
                <Text style={{ fontFamily: F.medium, fontSize: 10.5, color: C.faint, letterSpacing: 0.4 }}>
                  {(profile.visibility || 'private') === 'public' ? 'Public' : 'Private'}
                </Text>
              </View>
            </View>
            <Pencil size={16} color={C.violet} strokeWidth={2.2} />
          </Pressable>
        </Section>

        {/* Coach name */}
        <Section label="COACH NAME">
          <TextInput
            value={coachName}
            onChangeText={changeCoach}
            placeholder="e.g. Coach, Atlas, Nova"
            placeholderTextColor={C.faint2}
            autoComplete="off"
            style={inputStyle}
          />
          <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint, marginTop: 8 }}>
            This is what your AI coach is called throughout the app.
          </Text>
        </Section>

        {/* Cloud sync — only relevant once signed in */}
        {profile.userId && (
          <Section label="CLOUD SYNC">
            <SyncStatus isSyncing={isSyncing} pendingCount={0} hasError={syncError} lastSyncTime={lastSyncAt} awaitingConfirmation={awaitingConfirmation} />
          </Section>
        )}

        {/* Coach style */}
        <Section label="COACH STYLE">
          <View style={{ gap: 10 }}>
            {TONES.map((t) => {
              const on = profile.coachTone === t.id
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTone(t.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: on ? 'rgba(245,158,11,0.1)' : C.violetFill07, borderWidth: 1, borderColor: on ? C.amber : C.lineMid }}
                >
                  <Text style={{ fontSize: 20 }}>{t.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: on ? C.amber : C.ink }}>{t.label}</Text>
                    <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginTop: 1 }}>{t.desc}</Text>
                  </View>
                  {on && <Check size={18} color={C.amber} strokeWidth={2.6} />}
                </Pressable>
              )
            })}
          </View>
          <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint, marginTop: 10 }}>
            Changing the style changes how your coach talks to you everywhere.
          </Text>
        </Section>

        {/* AI features are powered by NorthStar's own backend — no user API key needed. */}
        <Section label="AI FEATURES">
          <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, lineHeight: 19 }}>
            Your Coach, dream readings, and roadmap suggestions are powered by NorthStar — there's nothing to set up.
          </Text>
        </Section>

        {/* Account */}
        {profile.userId && (
          <Section label="ACCOUNT">
            {!!profile.email && (
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, marginBottom: 12 }}>
                Signed in as <Text style={{ color: C.ink }}>{profile.email}</Text>
              </Text>
            )}
            <Pressable onPress={onSignOut} style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.violetFill }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.ink }}>Sign out</Text>
            </Pressable>
            <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint, marginTop: 8, marginBottom: 16 }}>
              Your dream and progress are saved to the cloud — sign back in on any device to pick up where you left off.
            </Text>
            <Pressable onPress={() => { setDeleteError(null); setConfirmingDelete(true) }} style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.06)' }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.red }}>Delete account</Text>
            </Pressable>
            <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.faint, marginTop: 8 }}>
              Permanently deletes your account and all your data. This can’t be undone.
            </Text>
          </Section>
        )}

        {/* Danger */}
        <Section label="DANGER ZONE">
          <Pressable onPress={onReset} style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.06)' }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.red }}>Reset & start over</Text>
          </Pressable>
        </Section>
      </ScrollView>

      {/* Delete-account confirmation — destructive, requires explicit confirm */}
      {confirmingDelete && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,7,15,0.82)', alignItems: 'center', justifyContent: 'center', padding: 28, zIndex: 300 }}>
          <View style={{ width: '100%', maxWidth: 420, borderRadius: 20, padding: 22, backgroundColor: C.card, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239,68,68,0.14)' }}>
                <AlertTriangle size={17} color={C.red} strokeWidth={2.2} />
              </View>
              <Text style={{ fontFamily: F.display, fontSize: 14, color: C.ink, letterSpacing: 1 }}>DELETE ACCOUNT</Text>
            </View>
            <Text style={{ fontFamily: F.body, fontSize: 14, color: C.ink2 || C.ink, lineHeight: 21, marginBottom: 6 }}>
              This permanently deletes your account and all your data — your dream, goals, and progress. This cannot be undone.
            </Text>
            {deleteError && (
              <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.red, lineHeight: 19, marginTop: 6 }}>{deleteError}</Text>
            )}
            <Pressable onPress={runDeleteAccount} disabled={deleting} style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 20, marginBottom: 10, backgroundColor: deleting ? 'rgba(239,68,68,0.4)' : C.red }}>
              {deleting && <ActivityIndicator size="small" color="#fff" />}
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: '#fff' }}>{deleting ? 'Deleting…' : 'Delete forever'}</Text>
            </Pressable>
            <Pressable onPress={() => setConfirmingDelete(false)} disabled={deleting} style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.dim }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {editingProfile && <EditProfile profile={profile} onUpdate={onUpdate} onClose={() => setEditingProfile(false)} />}
    </View>
  )
}

function Section({ label, children }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 10 }}>{label}</Text>
      {children}
    </View>
  )
}

const inputStyle = {
  backgroundColor: C.lineSoft,
  borderWidth: 1,
  borderColor: C.lineStrong,
  borderRadius: 12,
  paddingVertical: 13,
  paddingHorizontal: 16,
  fontFamily: F.body,
  fontSize: 15,
  color: C.ink,
}
