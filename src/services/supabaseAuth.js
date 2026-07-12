import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

// These two are PUBLIC values (the publishable/anon key is safe to ship — RLS is
// what protects data). Prefer env vars for deploy portability, fall back to the
// known project values so existing builds keep working.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wsgbnhiklczfiapqrnnf.supabase.co'
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_YK1olhdXjHYzbdlGABGP4w_37Qp8ROV'
const SUPABASE_KEY = SUPABASE_ANON_KEY

// Initialize Supabase client with AsyncStorage for session persistence
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
  },
})

// Get current auth user
export async function getCurrentUser() {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error) throw error
    return user
  } catch (error) {
    console.error('Failed to get current user:', error?.message)
    return null
  }
}

// Get current session
export async function getSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()
    if (error) throw error
    return session
  } catch (error) {
    console.error('Failed to get session:', error?.message)
    return null
  }
}

// Email/Password Sign Up. While the project auto-confirms (DB trigger), signUp
// returns no session, so we immediately sign in to establish one. Once "Confirm
// email" is enforced server-side that sign-in fails with "Email not confirmed" —
// expected — and callers get { needsConfirmation: true } to show the check-your-
// email step. The confirmation link redirects to confirm-email (northstar:// on
// native, <origin>/confirm-email on web).
export async function signUpWithEmail(email, password, metadata = {}) {
  const normalizedEmail = (email || '').trim().toLowerCase()
  try {
    console.log('[Auth] Signing up:', normalizedEmail)
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: Linking.createURL('confirm-email'),
        data: metadata, // e.g. { username, name } — lands in user_metadata
      },
    })
    if (error) throw error

    // Confirm-email mode returns an OBFUSCATED user (no session, empty identities)
    // when the email is ALREADY registered — anti-enumeration. Don't bind a profile
    // to that ghost id; treat it as "already registered".
    if (data.user && !data.session && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { user: null, session: null, needsConfirmation: false, error: 'That email is already registered — sign in instead.' }
    }

    let session = data.session
    let user = data.user
    if (!session) {
      const { data: si, error: siErr } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (!siErr && si?.session) {
        session = si.session
        user = si.user
      }
    }
    console.log('[Auth] Sign up OK:', user?.email, session ? '(session)' : '(no session — confirmation pending)')
    return { user, session, needsConfirmation: !!user && !session, error: null }
  } catch (error) {
    console.error('[Auth] Sign up failed:', error?.message)
    return { user: null, session: null, needsConfirmation: false, error: error?.message || 'Sign up failed' }
  }
}

// Re-send the signup confirmation email (rate-limited by Supabase — surface
// errors instead of retrying).
export async function resendConfirmation(email) {
  const normalizedEmail = (email || '').trim().toLowerCase()
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: { emailRedirectTo: Linking.createURL('confirm-email') },
    })
    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('[Auth] Resend confirmation failed:', error?.message)
    return { error: authErrMsg(error, 'Could not resend the email — please try again in a minute.') }
  }
}

// Establish a session from a confirmation/magic-link URL (native only — on web
// supabase-js auto-detects tokens in the URL). Parses access/refresh tokens from
// the link's fragment or query and calls setSession.
export async function establishSessionFromUrl(url) {
  try {
    const query = url.includes('?') ? url.split('?')[1].split('#')[0] : ''
    const hash = url.includes('#') ? url.split('#')[1] : ''

    // PKCE flow: the link carries ?code=… — exchange it for a session.
    const code = new URLSearchParams(query).get('code')
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) throw error
      return { session: data.session, error: null }
    }

    // Implicit flow: tokens arrive in the # fragment (or query).
    const params = new URLSearchParams(hash || query)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (!access_token || !refresh_token) return { session: null, error: null } // not a token link
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })
    if (error) throw error
    return { session: data.session, error: null }
  } catch (error) {
    console.error('[Auth] establishSessionFromUrl failed:', error?.message)
    return { session: null, error: error?.message || 'Could not establish session' }
  }
}

// Email/Password Sign In. Email is normalized (trim + lowercase) so casing or a
// stray space can't cause a "not recognized" mismatch with how it was stored.
export async function signInWithEmail(email, password) {
  const normalizedEmail = (email || '').trim().toLowerCase()
  try {
    console.log('[Auth] Signing in:', normalizedEmail)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    if (error) throw error
    console.log('[Auth] Sign in OK:', data.user?.email)
    return { user: data.user, session: data.session, error: null }
  } catch (error) {
    console.error('[Auth] Sign in failed:', error?.message)
    // Supabase returns the same "Invalid login credentials" for both a wrong
    // password and a non-existent account — make that distinction clearer.
    const msg = /invalid login credentials/i.test(error?.message || '')
      ? 'Email or password is incorrect, or no account exists for this email.'
      : error?.message || 'Sign in failed'
    return { user: null, session: null, error: msg }
  }
}

// Apple Sign-In
export async function signInWithApple() {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })

    if (!credential.identityToken) {
      throw new Error('No identity token returned from Apple Sign-In')
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    })

    if (error) throw error

    return { user: data.user, session: data.session, error: null }
  } catch (error) {
    if (error.code === 'ERR_CANCELED') {
      console.log('Apple Sign-In cancelled')
      return { user: null, session: null, error: 'Sign-in cancelled' }
    }
    console.error('Apple Sign-In failed:', error?.message)
    return { user: null, session: null, error: error?.message || 'Apple Sign-In failed' }
  }
}

// Google Sign-In with OAuth
export async function signInWithGoogle() {
  try {
    // Configure redirect URL for OAuth callback (matches app.json "scheme")
    const redirectUrl = 'northstar://oauth/callback'

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: false,
      },
    })

    if (error) throw error

    // Handle the OAuth URL. signInWithOAuth only returns { url } — NOT a session —
    // so we must exchange the ?code=… the browser redirect carries for a real
    // session (same PKCE step as establishSessionFromUrl). The old code returned
    // data.user/data.session here, which are undefined, so a successful Google
    // sign-in silently stranded the user on the sign-in screen.
    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)

      if (result.type === 'success' && result.url) {
        const code = new URL(result.url).searchParams.get('code')
        if (code) {
          const { data: sess, error: exErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exErr) throw exErr
          return { user: sess?.user || null, session: sess?.session || null, error: null }
        }
      }
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { user: null, session: null, error: 'Sign-in cancelled' }
      }
    }

    return { user: null, session: null, error: 'OAuth process incomplete' }
  } catch (error) {
    console.error('Google Sign-In failed:', error?.message)
    return { user: null, session: null, error: error?.message || 'Google Sign-In failed' }
  }
}

// Sign Out
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Sign out failed:', error?.message)
    return { error: error?.message || 'Sign out failed' }
  }
}

// Human-readable message from any thrown auth error. Server failures can carry
// an empty/raw-JSON message (a broken SMTP config once surfaced literally "{}"
// to users) — those get the fallback instead.
function authErrMsg(error, fallback) {
  const m = typeof error?.message === 'string' ? error.message.trim() : ''
  if (!m || /^[{[]/.test(m)) return fallback
  return m
}

// Password Reset
export async function resetPassword(email) {
  try {
    // Resolves to northstar://reset-password on native and <web-origin>/reset-password on web.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('reset-password'),
    })
    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Password reset failed:', error?.message)
    return { error: authErrMsg(error, 'Could not send the reset email — please try again in a minute.') }
  }
}

// Update Password
export async function updatePassword(newPassword) {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Password update failed:', error?.message)
    return { error: authErrMsg(error, 'Could not update the password — please try again.') }
  }
}

// Listen to auth state changes
export function onAuthStateChange(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback({ event, session, user: session?.user || null })
  })

  return subscription
}

// Get Supabase client (for direct use in other services)
export function getSupabaseClient() {
  return supabase
}

export default {
  getCurrentUser,
  getSession,
  signUpWithEmail,
  resendConfirmation,
  establishSessionFromUrl,
  signInWithEmail,
  signInWithApple,
  signInWithGoogle,
  signOut,
  resetPassword,
  updatePassword,
  onAuthStateChange,
  getSupabaseClient,
}
