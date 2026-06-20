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

// Email/Password Sign Up. New accounts are auto-confirmed (DB trigger), so if
// signUp doesn't return a session we immediately sign in to establish one —
// friends go straight into the app, no email round-trip.
export async function signUpWithEmail(email, password) {
  const normalizedEmail = (email || '').trim().toLowerCase()
  try {
    console.log('[Auth] Signing up:', normalizedEmail)
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
    })
    if (error) throw error

    let session = data.session
    let user = data.user
    if (!session) {
      const { data: si, error: siErr } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (!siErr && si?.session) {
        session = si.session
        user = si.user
      }
    }
    console.log('[Auth] Sign up OK:', user?.email, session ? '(session)' : '(no session)')
    return { user, session, error: null }
  } catch (error) {
    console.error('[Auth] Sign up failed:', error?.message)
    return { user: null, session: null, error: error?.message || 'Sign up failed' }
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

    // Handle the OAuth URL
    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)

      if (result.type === 'success') {
        const url = new URL(result.url)
        const code = url.searchParams.get('code')

        if (code) {
          // Exchange code for session (Supabase handles this automatically)
          return { user: data.user, session: data.session, error: null }
        }
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
    return { error: error?.message || 'Password reset failed' }
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
    return { error: error?.message || 'Password update failed' }
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
  signInWithEmail,
  signInWithApple,
  signInWithGoogle,
  signOut,
  resetPassword,
  updatePassword,
  onAuthStateChange,
  getSupabaseClient,
}
