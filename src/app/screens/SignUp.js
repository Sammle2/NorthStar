import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Mail, Eye, EyeOff, LogIn } from 'lucide-react-native'
import { C, F } from '../tokens'
import { signUpWithEmail } from '../../services/supabaseAuth'

export default function SignUp({ onSignUpSuccess, onSwitchToSignIn }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [signedUpUser, setSignedUpUser] = useState(null)

  const handleSignUp = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('All fields required')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    setError(null)

    const { user, session, error: authError } = await signUpWithEmail(email, password)

    if (authError) {
      setError(authError)
      setLoading(false)
      return
    }

    if (user) {
      // No email step — accounts auto-confirm + auto-sign-in, so go straight in.
      // (Cloud sync activates as soon as the session lands via the auth listener.)
      onSignUpSuccess(user, { name, email })
    } else {
      setError('Sign up failed. Try again.')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,158,11,0.14)', marginBottom: 20 }}>
          <Mail size={28} color={C.amber} strokeWidth={2} />
        </View>
        <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, letterSpacing: 1.2, marginBottom: 12, textAlign: 'center' }}>CHECK YOUR EMAIL</Text>
        <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, marginBottom: 8, textAlign: 'center', lineHeight: 21 }}>
          We sent a confirmation link to{'\n'}
          <Text style={{ color: C.ink, fontFamily: F.semibold }}>{email}</Text>
        </Text>
        <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.faint, marginBottom: 28, textAlign: 'center', lineHeight: 19 }}>
          Confirm it to back up your dream to the cloud. You can start right now — your progress saves on this device and syncs once you've confirmed.
        </Text>
        <Pressable onPress={() => onSignUpSuccess(signedUpUser, { name, email })} style={{ width: '100%', maxWidth: 360 }}>
          <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>Start building my roadmap</Text>
          </LinearGradient>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <Text style={{ fontFamily: F.display, fontSize: 28, color: C.ink, letterSpacing: 1.2, marginBottom: 8 }}>CREATE ACCOUNT</Text>
          <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, marginBottom: 32, lineHeight: 21 }}>
            Start your journey to your dream life.
          </Text>

          {/* Error */}
          {error && (
            <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: '#ef4444', lineHeight: 19 }}>{error}</Text>
            </View>
          )}

          {/* Name Input */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 8 }}>NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={C.faint2}
              autoComplete="name"
              editable={!loading}
              style={{ backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontFamily: F.body, fontSize: 15, color: C.ink }}
            />
          </View>

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
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 8 }}>PASSWORD</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 14 }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 8 characters"
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
          </View>

          {/* Confirm Password Input */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 8 }}>CONFIRM PASSWORD</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 14 }}>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor={C.faint2}
                secureTextEntry={!showConfirmPassword}
                autoComplete="password"
                editable={!loading}
                style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 13 }}
              />
              <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)} hitSlop={10}>
                {showConfirmPassword ? <EyeOff size={16} color={C.faint2} strokeWidth={2} /> : <Eye size={16} color={C.faint2} strokeWidth={2} />}
              </Pressable>
            </View>
          </View>

          {/* Sign Up Button */}
          <Pressable onPress={handleSignUp} disabled={loading} style={{ marginBottom: 32 }}>
            <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {loading ? <ActivityIndicator size="small" color={C.amberInk} /> : <LogIn size={16} color={C.amberInk} strokeWidth={2.2} />}
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>{loading ? 'Creating account...' : 'Create account'}</Text>
            </LinearGradient>
          </Pressable>

          {/* Sign In Link */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim }}>Already have an account?</Text>
            <Pressable onPress={onSwitchToSignIn} disabled={loading}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.amber }}>Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
