import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Eye, EyeOff, Lock } from 'lucide-react-native'
import { C, F } from '../tokens'
import { updatePassword } from '../../services/supabaseAuth'

// Reached via the password-recovery deep link (northstar://reset-password) once
// Supabase has established a recovery session. Sets a new password, then hands
// back to the app via onDone().
export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!password.trim() || !confirm.trim()) {
      setError('Enter and confirm your new password')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError(null)
    const { error: updErr } = await updatePassword(password)
    setLoading(false)
    if (updErr) {
      setError(updErr)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, letterSpacing: 1.2, marginBottom: 12, textAlign: 'center' }}>PASSWORD UPDATED</Text>
        <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, marginBottom: 28, textAlign: 'center', lineHeight: 21 }}>
          You’re all set. Your new password is ready to use.
        </Text>
        <Pressable onPress={onDone} style={{ width: '100%', maxWidth: 320 }}>
          <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>Continue</Text>
          </LinearGradient>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontFamily: F.display, fontSize: 28, color: C.ink, letterSpacing: 1.2, marginBottom: 8 }}>SET A NEW PASSWORD</Text>
          <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, marginBottom: 32, lineHeight: 21 }}>
            Choose a new password for your account.
          </Text>

          {error && (
            <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: '#ef4444', lineHeight: 19 }}>{error}</Text>
            </View>
          )}

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 8 }}>NEW PASSWORD</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 14 }}>
              <Lock size={16} color={C.faint2} strokeWidth={2} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 8 characters"
                placeholderTextColor={C.faint2}
                secureTextEntry={!show}
                autoComplete="password-new"
                editable={!loading}
                style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 13 }}
              />
              <Pressable onPress={() => setShow(!show)} hitSlop={10}>
                {show ? <EyeOff size={16} color={C.faint2} strokeWidth={2} /> : <Eye size={16} color={C.faint2} strokeWidth={2} />}
              </Pressable>
            </View>
          </View>

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 8 }}>CONFIRM PASSWORD</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 14 }}>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirm new password"
                placeholderTextColor={C.faint2}
                secureTextEntry={!show}
                autoComplete="password-new"
                editable={!loading}
                style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 13 }}
              />
            </View>
          </View>

          <Pressable onPress={submit} disabled={loading}>
            <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {loading && <ActivityIndicator size="small" color={C.amberInk} />}
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>{loading ? 'Saving…' : 'Save new password'}</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
