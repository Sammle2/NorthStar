import React, { useState } from 'react'
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowRight, Eye, EyeOff, Mail, LogIn } from 'lucide-react-native'
import { C, F } from '../tokens'
import { signInWithEmail, signInWithApple, signInWithGoogle, resetPassword } from '../../services/supabaseAuth'

export default function SignIn({ onSignInSuccess, onSwitchToSignUp, profile }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [forgotMode, setForgotMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleSendReset = async () => {
    if (!email.trim()) {
      setError('Enter your email first')
      return
    }
    setLoading(true)
    setError(null)
    const { error: resetErr } = await resetPassword(email.trim())
    setLoading(false)
    // Supabase doesn't reveal whether the email exists — always show success.
    if (resetErr) {
      setError(resetErr)
      return
    }
    setResetSent(true)
  }

  const handleEmailSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password required')
      return
    }

    setLoading(true)
    setError(null)

    const { user, session, error: authError } = await signInWithEmail(email, password)

    if (authError) {
      setError(authError)
      setLoading(false)
      return
    }

    if (user && session) {
      onSignInSuccess(user)
    } else {
      setError('Sign in failed. Please try again.')
      setLoading(false)
    }
  }

  const handleAppleSignIn = async () => {
    setLoading(true)
    setError(null)

    const { user, session, error: authError } = await signInWithApple()

    if (authError) {
      setError(authError)
      setLoading(false)
      return
    }

    if (user && session) {
      onSignInSuccess(user)
    } else {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)

    const { user, session, error: authError } = await signInWithGoogle()

    if (authError) {
      setError(authError)
      setLoading(false)
      return
    }

    if (user && session) {
      onSignInSuccess(user)
    } else {
      setLoading(false)
    }
  }

  // Forgot-password sub-view: collect email and send the reset link.
  if (forgotMode) {
    const backToSignIn = () => { setForgotMode(false); setResetSent(false); setError(null) }
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontFamily: F.display, fontSize: 28, color: C.ink, letterSpacing: 1.2, marginBottom: 8 }}>RESET PASSWORD</Text>
            <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, marginBottom: 32, lineHeight: 21 }}>
              Enter your email and we’ll send you a link to set a new password.
            </Text>

            {error && (
              <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <Text style={{ fontFamily: F.body, fontSize: 13, color: '#ef4444', lineHeight: 19 }}>{error}</Text>
              </View>
            )}

            {resetSent ? (
              <View style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.3)' }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 14, color: '#22c55e', marginBottom: 4 }}>Check your email</Text>
                <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, lineHeight: 20 }}>
                  If an account exists for {email.trim()}, a reset link is on its way. Open it on this device to set a new password.
                </Text>
              </View>
            ) : (
              <>
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 8 }}>EMAIL</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 14 }}>
                    <Mail size={16} color={C.faint2} strokeWidth={2} />
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={C.faint2}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      editable={!loading}
                      style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 13 }}
                    />
                  </View>
                </View>

                <Pressable onPress={handleSendReset} disabled={loading} style={{ marginBottom: 20 }}>
                  <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                    {loading && <ActivityIndicator size="small" color={C.amberInk} />}
                    <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>{loading ? 'Sending…' : 'Send reset link'}</Text>
                  </LinearGradient>
                </Pressable>
              </>
            )}

            <Pressable onPress={backToSignIn} disabled={loading} style={{ alignSelf: 'center' }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.dim }}>Back to sign in</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <Text style={{ fontFamily: F.display, fontSize: 28, color: C.ink, letterSpacing: 1.2, marginBottom: 8 }}>WELCOME BACK</Text>
          <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, marginBottom: 32, lineHeight: 21 }}>
            Sign in to access your dream and track your progress.
          </Text>

          {/* Error */}
          {error && (
            <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: '#ef4444', lineHeight: 19 }}>{error}</Text>
            </View>
          )}

          {/* Email Input */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 8 }}>EMAIL</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 14 }}>
              <Mail size={16} color={C.faint2} strokeWidth={2} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={C.faint2}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!loading}
                style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 13 }}
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 8 }}>PASSWORD</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 14 }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={C.faint2}
                secureTextEntry={!showPassword}
                autoComplete="password"
                editable={!loading}
                style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 13 }}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                {showPassword ? <EyeOff size={16} color={C.faint2} strokeWidth={2} /> : <Eye size={16} color={C.faint2} strokeWidth={2} />}
              </Pressable>
            </View>
            <Pressable onPress={() => { setError(null); setForgotMode(true) }} disabled={loading} style={{ alignSelf: 'flex-end', marginTop: 10 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.amber }}>Forgot password?</Text>
            </Pressable>
          </View>

          {/* Sign In Button */}
          <Pressable onPress={handleEmailSignIn} disabled={loading} style={{ marginBottom: 32 }}>
            <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {loading ? <ActivityIndicator size="small" color={C.amberInk} /> : <LogIn size={16} color={C.amberInk} strokeWidth={2.2} />}
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>{loading ? 'Signing in...' : 'Sign in with email'}</Text>
            </LinearGradient>
          </Pressable>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
            <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint }}>OR</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
          </View>

          {/* Apple Sign-In */}
          {Platform.OS !== 'web' && (
            <Pressable onPress={handleAppleSignIn} disabled={loading} style={{ marginBottom: 12 }}>
              <View style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.violetFill }}>
                {loading ? <ActivityIndicator size="small" color={C.violet} /> : <Text style={{ fontFamily: F.semibold, fontSize: 18, color: C.ink }}>􀯨</Text>}
                <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.ink }}>Sign in with Apple</Text>
              </View>
            </Pressable>
          )}

          {/* Google Sign-In */}
          {Platform.OS !== 'web' && (
            <Pressable onPress={handleGoogleSignIn} disabled={loading} style={{ marginBottom: 32 }}>
              <View style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.violetFill }}>
                {loading ? <ActivityIndicator size="small" color={C.violet} /> : <Text style={{ fontFamily: F.semibold, fontSize: 18, color: C.ink }}>󰊤</Text>}
                <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.ink }}>Sign in with Google</Text>
              </View>
            </Pressable>
          )}

          {/* Sign Up Link */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim }}>Don't have an account?</Text>
            <Pressable onPress={onSwitchToSignUp} disabled={loading}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.amber }}>Create one</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
