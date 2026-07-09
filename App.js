import React, { useEffect, useRef, useState } from 'react'
import { Animated, Platform, Pressable, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useFonts, Cinzel_600SemiBold, Cinzel_700Bold, Cinzel_900Black } from '@expo-google-fonts/cinzel'
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'

// Network monitoring only on native
let NetInfo = null
if (Platform.OS !== 'web') {
  try {
    NetInfo = require('@react-native-community/netinfo').default
  } catch (e) {
    console.warn('NetInfo not available')
  }
}

import { C, F } from './src/app/tokens'
import { clearState, currentStreak, loadState, reviewDue, saveState } from './src/app/store'
import { flushState, pullState, resetPushCache } from './src/services/cloudSync'
import { resetProfilePushCache } from './src/services/socialService'
import * as Linking from 'expo-linking'
import Welcome from './src/app/screens/Welcome'
import SignIn from './src/app/screens/SignIn'
import SignUp from './src/app/screens/SignUp'
import ResetPassword from './src/app/screens/ResetPassword'
import Onboarding from './src/app/screens/Onboarding'
import DreamReveal from './src/app/screens/DreamReveal'
import Dashboard from './src/app/screens/Dashboard'
import Roadmap from './src/app/screens/Roadmap'
import Sprints from './src/app/screens/Sprints'
import Social from './src/app/screens/Social'
import DMs from './src/app/screens/DMs'
import AddFriends from './src/app/components/AddFriends'
import CoachChat from './src/app/screens/CoachChat'
import Settings from './src/app/screens/Settings'
import Navigation from './src/app/components/Navigation'
import CoachReview from './src/app/components/CoachReview'
import GoalEditor from './src/app/components/GoalEditor'
import ErrorBoundary from './src/app/components/ErrorBoundary'
import StarField from './src/app/components/StarField'
import { LegalPage } from './src/app/components/LegalDocs'
import { establishSessionFromUrl, onAuthStateChange, resendConfirmation, signOut as supabaseSignOut, signUpWithEmail } from './src/services/supabaseAuth'
import { isUsernameAvailable } from './src/services/socialService'
import { COACH_MESSAGES, normalizeAiGoal } from './src/app/aiEngine'
import { generateRoadmap } from './src/services/aiService'
import { requestNotificationPermission, scheduleDailyCheckIn, cancelDailyCheckIn, onNotification } from './src/services/notificationService'
import { Bell } from 'lucide-react-native'

// On web, kill the default focus outline / tap-highlight (the "black box" that
// appeared around tab icons when clicked). Native has no such artifact.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const s = document.createElement('style')
  s.textContent = `
    * { outline: none !important; -webkit-tap-highlight-color: transparent; }
    /* Hide scrollbars everywhere while keeping scroll functional. */
    * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
    *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
  `
  document.head.appendChild(s)
}

// Faithful React Native port of the "Dream Life Roadmap" Figma build.
export default function App() {
  const [fontsLoaded] = useFonts({
    Cinzel_600SemiBold,
    Cinzel_700Bold,
    Cinzel_900Black,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  })

  const [booted, setBooted] = useState(false)
  const [appState, setAppState] = useState({ profile: null, dreamRevealSeen: false })
  const [screen, setScreen] = useState('welcome')
  const [tab, setTab] = useState('dashboard')
  const [showReview, setShowReview] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [isOnline, setIsOnline] = useState(true)
  const [authUser, setAuthUser] = useState(null)
  const [authSubScreen, setAuthSubScreen] = useState('signin') // 'signin' or 'signup'
  // Notice + prefill shown on the Sign-in screen when we route someone there
  // (e.g. quick-start intake with an email that already has an account).
  const [authNotice, setAuthNotice] = useState(null)
  const [authPrefillEmail, setAuthPrefillEmail] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [syncError, setSyncError] = useState(false)
  const [hasSession, setHasSession] = useState(false) // true only with an active (confirmed) session
  const [boundaryKey, setBoundaryKey] = useState(0) // bump to remount the tab tree after a caught crash
  const [showDMs, setShowDMs] = useState(false)
  const [showAddFriends, setShowAddFriends] = useState(false)
  const [socialReload, setSocialReload] = useState(0)
  const [banner, setBanner] = useState(null)
  const [resendState, setResendState] = useState('idle') // idle | sending | sent | error
  const syncIntervalRef = useRef(null)
  const authSubscriptionRef = useRef(null)
  const appStateRef = useRef(appState)
  appStateRef.current = appState // always-current snapshot for interval/listener callbacks
  const hasSessionRef = useRef(false)
  hasSessionRef.current = hasSession

  // Network connectivity monitoring (native only)
  useEffect(() => {
    if (!NetInfo) return

    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable
      setIsOnline(online)
      if (online) performSync() // flush the latest snapshot on reconnect
    })

    return () => unsubscribe?.()
  }, [])

  // Safety-net flush loop (every 30s). The debounced push-on-save in store.js
  // covers most writes; this catches anything that slipped through / went offline.
  // Only runs with an active session — an unconfirmed signup has none, so we don't
  // hammer RLS with writes that can't succeed yet.
  useEffect(() => {
    if (isOnline && hasSession && appState.profile?.userId) {
      syncIntervalRef.current = setInterval(performSync, 30000)
    }
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [isOnline, hasSession, appState.profile?.userId])

  // Flush the current app-state blob to the cloud. No-op without a confirmed session.
  const performSync = async () => {
    const uid = appStateRef.current?.profile?.userId
    if (!uid || !hasSessionRef.current) return
    try {
      setIsSyncing(true)
      setSyncError(false)
      await flushState(uid, appStateRef.current)
      setLastSyncAt(new Date().toISOString())
    } catch (error) {
      console.error('[CloudSync] flush failed:', error?.message)
      setSyncError(true)
    } finally {
      setIsSyncing(false)
    }
  }

  // Auth state listener
  useEffect(() => {
    try {
      authSubscriptionRef.current = onAuthStateChange(({ event, session, user }) => {
        setAuthUser(user)
        setHasSession(!!session) // no session = unconfirmed signup → sync stays off
        console.log('[Auth]', event, user?.email, session ? '(session)' : '(no session)')

        // A real session means the email is confirmed (or auto-confirm is on) —
        // clear any pending-confirmation flag so the sticky chip disappears.
        if (session) {
          const pr = appStateRef.current?.profile
          if (pr?.pendingEmailConfirmation) {
            persist({ ...appStateRef.current, profile: { ...pr, pendingEmailConfirmation: false } })
          }
        }

        // Recovery link established a session → let the user set a new password.
        if (event === 'PASSWORD_RECOVERY') {
          setScreen('reset-password')
          return
        }

        // If logged out, clear profile and go to welcome
        if (event === 'SIGNED_OUT' && screen === 'app') {
          handleSignOut()
        }
      })
    } catch (error) {
      console.error('[Auth] Listener setup failed:', error?.message)
    }

    return () => {
      try {
        authSubscriptionRef.current?.unsubscribe?.()
      } catch (e) {
        console.error('[Auth] Unsubscribe failed:', e?.message)
      }
    }
  }, [screen])

  // Deep links: route a password-recovery link to the reset screen, and turn an
  // email-confirmation link into a live session. On web, supabase-js auto-detects
  // tokens in the URL (PASSWORD_RECOVERY / SIGNED_IN fire via the listener); on
  // native this listener catches the northstar:// open and sets the session itself.
  useEffect(() => {
    const onUrl = async ({ url }) => {
      if (!url) return
      if (url.includes('reset-password') || url.includes('type=recovery')) {
        setScreen('reset-password')
        return
      }
      if (url.includes('confirm-email') || url.includes('type=signup')) {
        if (Platform.OS !== 'web') {
          const { session } = await establishSessionFromUrl(url)
          if (session) console.log('[Auth] email confirmed — session established')
        }
        // hasSession flips via the auth listener; sync starts on its own.
      }
    }
    const sub = Linking.addEventListener('url', onUrl)
    Linking.getInitialURL().then((url) => { if (url) onUrl({ url }) }).catch(() => {})
    return () => sub?.remove?.()
  }, [])

  // Load app state and init
  useEffect(() => {
    // If the app was cold-opened from a password-recovery link, that wins over
    // normal boot routing (web: URL is readable synchronously here).
    const isRecoveryLink =
      typeof window !== 'undefined' && /[?#&/](reset-password|type=recovery)/.test(window.location?.href || '')

    loadState()
      .then((s) => {
        setAppState(s)

        // Flow: welcome → signin/signup → onboarding → dream → app
        if (isRecoveryLink) {
          setScreen('reset-password')
        } else if (!s.profile) {
          setScreen('welcome')
        } else if (!s.profile.userId && !s.profile.email) {
          // Profile exists but not linked to auth — need to sign in
          setScreen('auth')
        } else if (s.profile.dreamDescription || (s.profile.goals || []).length) {
          // Returning, onboarded user: straight to the app. The dream reveal is a
          // one-time onboarding step, never replayed — so we never strand them on
          // that nav-less screen again.
          setScreen('app')
        } else {
          // Signed in but onboarding unfinished — resume it.
          setScreen('onboarding')
        }

        setBooted(true)
      })
      .catch((error) => {
        console.error('[App] Failed to load state:', error?.message)
        setScreen('welcome')
        setBooted(true)
      })
  }, [])

  useEffect(() => {
    if (screen === 'app' && reviewDue(appState.profile)) setShowReview(true)
  }, [screen, appState.profile])

  // In-app notification banner — surfaces check-ins / motivations from the
  // notification service (visible in the preview + the native fallback path).
  useEffect(() => onNotification((n) => setBanner(n)), [])
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 6000)
    return () => clearTimeout(t)
  }, [banner])

  // Upgrade template goals to goal-specific AI roadmaps in the background: the
  // primary goal and chat-added goals already get the AI treatment, but survey
  // supporting goals (and older accounts) carry generic local scaffolds. Once
  // per session, every UNTOUCHED template goal (no progress, no completed steps)
  // is rebuilt from its own title — milestones AND daily actions become specific,
  // which also feeds the Today tab's three tasks. Failures just keep the template.
  const goalsUpgradedRef = useRef(false)
  useEffect(() => {
    if (screen !== 'app' || !hasSession || goalsUpgradedRef.current) return
    const untouched = (g) =>
      g.source !== 'ai' && (g.progress || 0) === 0 &&
      !(g.milestones || []).some((m) => m.completed || (m.steps || []).some((s) => s.completed))
    const candidates = (appStateRef.current?.profile?.goals || []).filter(untouched)
    if (!candidates.length) { goalsUpgradedRef.current = true; return }
    goalsUpgradedRef.current = true
    ;(async () => {
      for (const g of candidates) {
        try {
          const ai = await generateRoadmap({
            name: appStateRef.current?.profile?.name,
            rawGoal: g.title,
            tone: appStateRef.current?.profile?.coachTone,
          })
          updateProfile((prof) => {
            const target = (prof.goals || []).find((x) => x.id === g.id)
            if (!target || !untouched(target)) return prof // deleted or started meanwhile
            const upgraded = normalizeAiGoal(ai, target.title, '', target.id)
            return { ...prof, goals: prof.goals.map((x) => (x.id === g.id ? { ...upgraded, title: target.title } : x)) }
          })
        } catch (e) {
          console.warn('[Goals] AI upgrade failed for', g.title, '- keeping template:', e?.message)
        }
      }
    })()
  }, [screen, hasSession])

  // Schedule the daily 1pm "quick check" once the user is in the app. The message
  // text is resolved at fire time so it reflects the current tone / streak.
  useEffect(() => {
    if (screen !== 'app' || !appState.profile) return
    requestNotificationPermission()
    scheduleDailyCheckIn(() => {
      const prof = appStateRef.current?.profile || {}
      const tone = prof.coachTone || 'default'
      const first = (prof.name || '').split(' ')[0] || 'there'
      const body = (COACH_MESSAGES[tone]?.checkIn || COACH_MESSAGES.default.checkIn)
        .replace('{streak}', String(currentStreak(prof)))
        .replace('{name}', first)
      return { title: prof.coachName || 'Nova', body }
    })
    return () => cancelDailyCheckIn()
  }, [screen, appState.profile?.userId])

  const persist = (next) => {
    appStateRef.current = next // keep the ref current so same-tick reads never lag a render
    setAppState(next)
    saveState(next)
  }
  // Accepts a full profile object OR an updater (prevProfile) => nextProfile. Always
  // works off the CURRENT profile via the ref, so an async writer (e.g. a NOVA reply
  // that resolves after the user left the Coach tab) MERGES its change instead of
  // reverting edits made in the meantime.
  const updateProfile = (profileOrFn) => {
    const cur = appStateRef.current
    const profile = typeof profileOrFn === 'function' ? profileOrFn(cur.profile) : profileOrFn
    persist({ ...cur, profile })
  }

  const handleSignInSuccess = async (user) => {
    console.log('[Auth] Sign-in success:', user.email)
    setAuthUser(user)
    resetPushCache() // new session — make sure the first save pushes
    resetProfilePushCache()

    // Pull this user's cloud snapshot so a returning user on a fresh device
    // gets their dream/goals/progress back.
    const cloud = await pullState(user.id)
    const cloudProfile = cloud?.state?.profile

    let nextState
    if (cloudProfile && (cloudProfile.dreamDescription || (cloudProfile.goals || []).length)) {
      // Returning user with real cloud data — adopt it (cloud wins on sign-in).
      nextState = {
        ...cloud.state,
        profile: { ...cloudProfile, userId: user.id, email: user.email },
      }
    } else {
      // No meaningful cloud data — keep whatever's local, just link the account.
      const p = appState.profile || {}
      nextState = { ...appState, profile: { ...p, userId: user.id, email: user.email } }
    }

    // Route based on the resolved profile. A returning, onboarded user goes
    // STRAIGHT TO THE APP on sign-in — the dream reveal is a one-time onboarding
    // moment, never replayed on login. We also mark it seen so cold-boot routing
    // agrees and can never strand them on that nav-less screen again.
    const prof = nextState.profile
    const onboarded = !!(prof.dreamDescription || (prof.goals || []).length)
    if (onboarded) {
      persist({ ...nextState, dreamRevealSeen: true })
      setTab('dashboard')
      setScreen('app')
    } else {
      persist(nextState)
      setScreen('onboarding')
    }
  }

  const freshProfile = (user, name = '', username = '') => ({
    userId: user.id,
    email: user.email,
    username,
    bio: '',
    avatarUrl: null,
    visibility: 'private',
    name: name || '',
    coachName: 'Nova',
    coachTone: 'default',
    dreamDescription: '',
    dreamStory: '',
    gender: '',
    age: '',
    location: '',
    joinedDate: new Date().toISOString(),
    lastCheckIn: null,
    streak: 0,
    goals: [],
    dailyActions: [],
    nonNeg: {},
    lastCheckInDate: null,
    sprints: [],
    lastLongTermReview: null,
    dreamRevealSeen: false,
    autoSyncEnabled: true,
    lastSyncTime: null,
    apiKeys: { claude: null, dalle: null },
  })

  const handleSignUpSuccess = (user, metadata) => {
    console.log('[Auth] Sign-up success:', user.email)
    persist({ profile: { ...freshProfile(user, metadata.name, metadata.username || ''), pendingEmailConfirmation: !!metadata.needsConfirmation }, dreamRevealSeen: false })
    setAuthUser(user)
    setScreen('onboarding')
  }

  // "Begin Your Journey" — straight into the Coach intake. The account (with a
  // chosen username + REAL email) is claimed during intake via handleClaimAccount;
  // returning users are routed by how far they've gotten.
  const handleBegin = async () => {
    const existing = appStateRef.current?.profile
    if (existing?.userId) {
      if (existing.dreamDescription || (existing.goals || []).length) {
        // Already onboarded → straight into the app, never replay the dream reveal.
        persist({ ...appStateRef.current, dreamRevealSeen: true })
        setTab('dashboard')
        setScreen('app')
      } else {
        // Signed in but intake unfinished → resume the Coach intake form.
        setScreen('onboarding')
      }
      return
    }
    setScreen('onboarding')
  }

  // Claim the account from the Onboarding intake: username + real email + the
  // user's OWN password (so they can sign in anywhere, not just recover via
  // email). Returns an error string for the form, or null on success.
  const handleClaimAccount = async ({ username, email, password, name }) => {
    try {
      if (!username || username.length < 3) return 'Pick a username of at least 3 characters.'
      if (!email) return 'Enter your email — you’ll get a confirmation link.'
      if (!password || password.length < 8) return 'Create a password of at least 8 characters.'

      // Check the handle BEFORE creating the account — so a collision never leaves
      // an orphaned auth user behind, and a retry never dead-ends on "already
      // registered". Best-effort: isUsernameAvailable fails open, and the DB
      // unique index is the real enforcement.
      const free = await isUsernameAvailable(username)
      if (!free) return `@${username} is taken — try another.`

      const { user, needsConfirmation, error } = await signUpWithEmail(email, password, { username, name })
      if (error || !user) {
        if (/already registered|already been registered|already exists/i.test(error || '')) {
          // Known account → don't dead-end the intake: take them straight to
          // Sign in with their email prefilled and a clear notice.
          setAuthNotice('This e-mail is already associated with an account.')
          setAuthPrefillEmail(email)
          setAuthSubScreen('signin')
          setScreen('auth')
          return 'This e-mail is already associated with an account.'
        }
        return error || 'Could not create your account. Try again.'
      }

      resetPushCache()
      resetProfilePushCache()
      setAuthUser(user)
      persist({ ...appStateRef.current, profile: { ...freshProfile(user, name, username), pendingEmailConfirmation: !!needsConfirmation }, dreamRevealSeen: false })
      return null
    } catch (e) {
      console.error('[Auth] claim account failed:', e?.message)
      return 'Could not create your account. Check your connection and try again.'
    }
  }

  const handleSignOut = async () => {
    // Push any unsynced changes before we drop the session.
    try {
      const uid = appStateRef.current?.profile?.userId
      if (uid) await flushState(uid, appStateRef.current)
    } catch (e) {
      console.warn('[CloudSync] final flush on sign-out failed:', e?.message)
    }
    await supabaseSignOut()
    resetPushCache()
    resetProfilePushCache()
    clearState()
    setShowSettings(false)
    setAuthUser(null)
    setLastSyncAt(null)
    setSyncError(false)
    setAppState({ profile: null, dreamRevealSeen: false })
    setScreen('welcome')
  }

  // After the server has deleted the account (delete-account edge function), tear
  // down the local session — no flush (the cloud row is already gone).
  const handleDeleteAccount = async () => {
    try {
      await supabaseSignOut()
    } catch (e) {
      console.warn('[Auth] sign-out after delete failed:', e?.message)
    }
    resetPushCache()
    resetProfilePushCache()
    clearState()
    setShowSettings(false)
    setAuthUser(null)
    setHasSession(false)
    setLastSyncAt(null)
    setSyncError(false)
    setAppState({ profile: null, dreamRevealSeen: false })
    setScreen('welcome')
  }

  const handleOnboardingComplete = (profile) => {
    // MERGE over the existing profile (onboarding fields win) so the identity
    // fields set at account-claim time — userId, email, username, avatarUrl —
    // survive intake completion instead of being wholesale-replaced away.
    const existing = appStateRef.current?.profile || {}
    persist({ profile: { ...existing, ...profile }, dreamRevealSeen: false })
    setScreen('dream')
  }

  const handleDreamContinue = () => {
    persist({ ...appState, dreamRevealSeen: true })
    setTab('dashboard')
    setScreen('app')
  }

  const handleReset = async () => {
    await handleSignOut()
  }
  const handleReviewComplete = (profile) => {
    persist({ ...appState, profile })
    setShowReview(false)
  }
  const handleGoalSave = (updatedGoal) => {
    const goals = p.goals.map((g) => (g.id === updatedGoal.id ? updatedGoal : g))
    persist({ ...appState, profile: { ...p, goals } })
    setEditingGoal(null)
  }

  // Public legal pages — /terms and /privacy render standalone with NO login and
  // without booting the app state machine, so they can be linked from an app-store
  // listing or marketing site. Web only; path is read once at render.
  const legalPath = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.pathname.replace(/\/+$/, '').toLowerCase()
    : ''
  if (legalPath === '/terms' || legalPath === '/privacy') {
    if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />
    return <LegalPage doc={legalPath === '/terms' ? 'terms' : 'privacy'} />
  }

  if (!fontsLoaded || !booted) return <View style={{ flex: 1, backgroundColor: C.bg }} />

  const p = appState.profile

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', overflow: 'hidden' }}>
      <StatusBar style="light" />

      {/* Starfield fills the whole window; the opaque phone frame covers the
          middle, so on wide / fullscreen browsers the stars show through the
          side gutters instead of flat empty space. */}
      <StarField count={220} seed={5} maxTop={100} />

      {/* Phone-width frame. On web the width is FIXED (375 = iPhone width) so the
          tab never shrinks or grows — narrowing the window only eats the star
          gutters on either side, and the tab keeps its exact dimensions. Kept a
          touch under a typical viewport so there's always a little gutter buffer
          and edge icons never clip. flex:1 keeps it full-height. Native stays
          fluid (width capped at 430) so real phones fill the screen. */}
      <View style={{ flex: 1, backgroundColor: C.bg, ...(Platform.OS === 'web' ? { width: 375 } : { width: '100%', maxWidth: 430 }) }}>
      {/* Sticky confirm-your-email chip: shown while the signup is unconfirmed
          (real email, no session). Unlike the notification banner it never
          auto-dismisses; tap = resend the confirmation email. */}
      {p?.pendingEmailConfirmation && !hasSession && booted &&
        (screen === 'app' || screen === 'onboarding' || screen === 'dream') && (
        <Pressable
          onPress={async () => {
            if (resendState === 'sending') return
            setResendState('sending')
            const { error } = await resendConfirmation(p.email)
            setResendState(error ? 'error' : 'sent')
          }}
          style={{ position: 'absolute', bottom: 96, left: 12, right: 12, zIndex: 999, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(30,22,8,0.97)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.amber }}>Confirm your email to unlock cloud backup & AI</Text>
            <Text style={{ fontFamily: F.body, fontSize: 11.5, color: C.dim, marginTop: 2 }}>
              {resendState === 'sent' ? `Sent! Check ${p.email}` : resendState === 'error' ? 'Could not resend — try again in a minute' : `We emailed ${p.email} — tap to resend`}
            </Text>
          </View>
        </Pressable>
      )}
      {banner && (
        <Pressable
          onPress={() => setBanner(null)}
          style={{ position: 'absolute', top: 44, left: 12, right: 12, zIndex: 1000, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(20,20,38,0.98)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }}
        >
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(124,58,237,0.35)', alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={15} color={C.violet} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.ink }}>{banner.title || 'Nova'}</Text>
            <Text numberOfLines={3} style={{ fontFamily: F.body, fontSize: 12.5, color: C.dim, marginTop: 2 }}>{banner.body}</Text>
          </View>
        </Pressable>
      )}
      <ErrorBoundary key={`root-${boundaryKey}`} onReset={() => setBoundaryKey((k) => k + 1)}>
      {screen === 'welcome' && <Welcome onBegin={handleBegin} onSignIn={() => { setAuthSubScreen('signin'); setScreen('auth') }} />}

      {screen === 'auth' && (
        <>
          {authSubScreen === 'signin' ? (
            <SignIn
              onSignInSuccess={(u) => { setAuthNotice(null); setAuthPrefillEmail(''); handleSignInSuccess(u) }}
              onSwitchToSignUp={() => { setAuthNotice(null); setAuthSubScreen('signup') }}
              profile={appState.profile}
              notice={authNotice}
              prefillEmail={authPrefillEmail}
            />
          ) : (
            <SignUp onSignUpSuccess={handleSignUpSuccess} onSwitchToSignIn={() => setAuthSubScreen('signin')} />
          )}
        </>
      )}

      {screen === 'reset-password' && (
        <ResetPassword
          onDone={() => {
            // New password set. If we already have a full profile, go to the app;
            // otherwise send them to sign in.
            if (p && p.userId && p.dreamDescription) setScreen('app')
            else { setAuthSubScreen('signin'); setScreen('auth') }
          }}
        />
      )}

      {screen === 'onboarding' && (
        <Onboarding
          onComplete={handleOnboardingComplete}
          onClaimAccount={handleClaimAccount}
          hasAccount={!!appState.profile?.userId}
        />
      )}
      {screen === 'dream' && p && <DreamReveal profile={p} onContinue={handleDreamContinue} />}

      {screen === 'app' && p && (
        <View style={{ flex: 1 }}>
          <ErrorBoundary key={`${tab}-${boundaryKey}`} onReset={() => setBoundaryKey((k) => k + 1)}>
            <TabFade tabKey={tab}>
              {tab === 'dashboard' && <Dashboard profile={p} onUpdate={updateProfile} onOpenSettings={() => setShowSettings(true)} onOpenCoach={() => setTab('coach')} />}
              {tab === 'roadmap' && <Roadmap profile={p} onUpdate={updateProfile} onRedoGoal={setEditingGoal} />}
              {tab === 'sprints' && <Sprints profile={p} onUpdate={updateProfile} />}
              {tab === 'community' && <Social profile={p} reloadKey={socialReload} onOpenDMs={() => setShowDMs(true)} onOpenAddFriends={() => setShowAddFriends(true)} />}
              {tab === 'coach' && <CoachChat profile={p} onUpdate={updateProfile} />}
            </TabFade>
          </ErrorBoundary>

          <Navigation
            active={tab}
            onChange={(t) => {
              // Refetch the feed every time the Friends tab is (re)opened so it
              // always shows live data, not the last-loaded snapshot.
              if (t === 'community') setSocialReload((k) => k + 1)
              setTab(t)
            }}
          />

          {showReview && <CoachReview profile={p} onComplete={handleReviewComplete} />}
          {showSettings && (
            <Settings
              profile={p}
              onUpdate={updateProfile}
              onClose={() => setShowSettings(false)}
              onReset={handleReset}
              isSyncing={isSyncing}
              lastSyncAt={lastSyncAt}
              syncError={syncError}
              awaitingConfirmation={!!p.userId && !hasSession}
              onSignOut={handleSignOut}
              onDeleteAccount={handleDeleteAccount}
            />
          )}
          {editingGoal && <GoalEditor goal={editingGoal} onSave={handleGoalSave} onCancel={() => setEditingGoal(null)} dream={p.dreamDescription} />}
          {showDMs && <DMs profile={p} onClose={() => setShowDMs(false)} />}
          {showAddFriends && <AddFriends profile={p} onClose={() => setShowAddFriends(false)} onChanged={() => setSocialReload((k) => k + 1)} />}
        </View>
      )}
      </ErrorBoundary>
      </View>
    </View>
  )
}

// Cross-fades + "pops" tab content on switch — the Figma's page transition.
function TabFade({ tabKey, children }) {
  const fade = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(14)).current
  const scale = useRef(new Animated.Value(0.97)).current
  useEffect(() => {
    fade.setValue(0)
    rise.setValue(14)
    scale.setValue(0.97)
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(rise, { toValue: 0, useNativeDriver: true, friction: 8, tension: 80 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }),
    ]).start()
  }, [tabKey])
  return <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateY: rise }, { scale }] }}>{children}</Animated.View>
}
