import React, { useEffect, useRef, useState } from 'react'
import { Animated, Platform, View } from 'react-native'
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

import { C } from './src/app/tokens'
import { clearState, loadState, reviewDue, saveState } from './src/app/store'
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
import { onAuthStateChange, signOut as supabaseSignOut, signUpWithEmail } from './src/services/supabaseAuth'

// On web, kill the default focus outline / tap-highlight (the "black box" that
// appeared around tab icons when clicked). Native has no such artifact.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const s = document.createElement('style')
  s.textContent = `* { outline: none !important; -webkit-tap-highlight-color: transparent; }`
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
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [syncError, setSyncError] = useState(false)
  const [hasSession, setHasSession] = useState(false) // true only with an active (confirmed) session
  const [boundaryKey, setBoundaryKey] = useState(0) // bump to remount the tab tree after a caught crash
  const [showDMs, setShowDMs] = useState(false)
  const [showAddFriends, setShowAddFriends] = useState(false)
  const [socialReload, setSocialReload] = useState(0)
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

  // Deep links: route a password-recovery link to the reset screen. On web,
  // supabase-js also auto-detects the recovery token and fires PASSWORD_RECOVERY
  // (handled above); on native this listener catches the northstar:// open.
  useEffect(() => {
    const onUrl = ({ url }) => {
      if (url && (url.includes('reset-password') || url.includes('type=recovery'))) {
        setScreen('reset-password')
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

        // Entry-screen rule: the ONLY thing that decides where we land is whether
        // there's a real roadmap yet.
        //   • recovery link    → reset-password
        //   • has dream/goals  → app   (returning, onboarded user)
        //   • everything else  → welcome
        // "Everything else" includes a signed-in user whose onboarding never
        // finished. We deliberately never cold-boot into the nav-less Onboarding
        // screen: a half-finished start used to strand the user there with no way
        // back to Welcome. Now they always land on Welcome and resume via "Begin
        // Your Journey" (handleBegin reuses their existing silent account — no new
        // account is minted).
        const onboarded = !!s.profile && (s.profile.dreamDescription || (s.profile.goals || []).length)
        if (isRecoveryLink) {
          setScreen('reset-password')
        } else if (onboarded) {
          setScreen('app')
        } else {
          setScreen('welcome')
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

  const persist = (next) => {
    setAppState(next)
    saveState(next)
  }
  const updateProfile = (profile) => persist({ ...appState, profile })

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

  const freshProfile = (user, name = '') => ({
    userId: user.id,
    email: user.email,
    username: '',
    bio: '',
    avatarUrl: null,
    visibility: 'private',
    name: name || '',
    coachName: 'Coach',
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
    visionBoardKeywords: [],
    visionBoardImages: [],
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
    persist({ profile: freshProfile(user, metadata.name), dreamRevealSeen: false })
    setAuthUser(user)
    setScreen('onboarding')
  }

  // "Begin Your Journey" — no email/login step. Create a silent account so the
  // user has a real session (cloud sync + social work), then go straight to the
  // Coach intake. They can set a username later; returning users use "Sign in".
  const handleBegin = async () => {
    // Returning, already-signed-in user tapping the CTA: don't mint a new silent
    // account — route them into their existing journey by how far they've gotten.
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

    const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
    const email = `northstar.${rand}@gmail.com`
    const password = `Ns!${Math.random().toString(36).slice(2, 12)}A1`
    const { user, session, error } = await signUpWithEmail(email, password)
    if (error || !user) {
      // Fallback to the normal auth screen if the silent signup fails.
      console.warn('[Auth] silent begin failed, showing auth:', error)
      setAuthSubScreen('signup')
      setScreen('auth')
      return
    }
    resetPushCache()
    resetProfilePushCache()
    setAuthUser(user)
    persist({ profile: freshProfile(user), dreamRevealSeen: false })
    setScreen('onboarding')
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
    // Onboarding builds a fresh profile object from the intake answers — it does
    // NOT carry the auth linkage (userId/email/username/visibility) that handleBegin
    // seeded. Merge onto the existing profile so the account link survives; otherwise
    // the next cold boot sees a profile with no userId (can't cloud-sync, and used to
    // bounce the user to the sign-in screen for an account they can't sign into).
    const base = appStateRef.current?.profile || {}
    persist({ ...appStateRef.current, profile: { ...base, ...profile }, dreamRevealSeen: false })
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

  if (!fontsLoaded || !booted) return <View style={{ flex: 1, backgroundColor: C.bg }} />

  const p = appState.profile

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />

      <ErrorBoundary key={`root-${boundaryKey}`} onReset={() => setBoundaryKey((k) => k + 1)}>
      {screen === 'welcome' && <Welcome onBegin={handleBegin} onSignIn={() => { setAuthSubScreen('signin'); setScreen('auth') }} />}

      {screen === 'auth' && (
        <>
          {authSubScreen === 'signin' ? (
            <SignIn onSignInSuccess={handleSignInSuccess} onSwitchToSignUp={() => setAuthSubScreen('signup')} profile={appState.profile} />
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

      {screen === 'onboarding' && <Onboarding onComplete={handleOnboardingComplete} onExit={() => setScreen('welcome')} />}
      {screen === 'dream' && p && <DreamReveal profile={p} onContinue={handleDreamContinue} />}

      {screen === 'app' && p && (
        <View style={{ flex: 1 }}>
          <ErrorBoundary key={`${tab}-${boundaryKey}`} onReset={() => setBoundaryKey((k) => k + 1)}>
            <TabFade tabKey={tab}>
              {tab === 'dashboard' && <Dashboard profile={p} onUpdate={updateProfile} onOpenSettings={() => setShowSettings(true)} />}
              {tab === 'roadmap' && <Roadmap profile={p} onUpdate={updateProfile} onRedoGoal={setEditingGoal} />}
              {tab === 'sprints' && <Sprints profile={p} onUpdate={updateProfile} />}
              {tab === 'community' && <Social profile={p} reloadKey={socialReload} onOpenDMs={() => setShowDMs(true)} onOpenAddFriends={() => setShowAddFriends(true)} />}
              {tab === 'coach' && <CoachChat profile={p} onUpdate={updateProfile} />}
            </TabFade>
          </ErrorBoundary>

          <Navigation active={tab} onChange={setTab} />

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
