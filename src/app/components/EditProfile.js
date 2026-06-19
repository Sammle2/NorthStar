import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import { Camera, Check, Globe, Lock, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import Avatar from './Avatar'
import { uploadAvatar, isUsernameAvailable, saveProfileNow } from '../../services/socialService'

// Edit your public profile: photo, handle, name, bio, city, and who can see you.
export default function EditProfile({ profile, onUpdate, onClose }) {
  const [username, setUsername] = useState(profile.username || '')
  const [name, setName] = useState(profile.name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [city, setCity] = useState(profile.location || '')
  const [visibility, setVisibility] = useState(profile.visibility || 'private')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const pickPhoto = async () => {
    setError(null)
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      setError('Photo access is needed to set a profile picture.')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 })
    if (res.canceled) return
    const uri = res.assets?.[0]?.uri
    if (!uri) return
    setUploading(true)
    const { url, error: upErr } = await uploadAvatar(profile.userId, uri)
    setUploading(false)
    if (upErr) {
      setError(upErr)
      return
    }
    setAvatarUrl(url)
  }

  const cleanUsername = (v) => v.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)

  const save = async () => {
    const uname = username.trim()
    if (uname && uname.length < 3) {
      setError('Username must be at least 3 characters.')
      return
    }
    setSaving(true)
    setError(null)
    if (uname) {
      const available = await isUsernameAvailable(uname, profile.userId)
      if (!available) {
        setSaving(false)
        setError('That username is taken. Try another.')
        return
      }
    }
    const next = { ...profile, username: uname, name: name.trim() || profile.name, bio: bio.trim(), location: city.trim(), visibility, avatarUrl }
    onUpdate(next) // persist locally + debounced projection sync
    await saveProfileNow(next) // immediate projection so friends see it now
    setSaving(false)
    onClose()
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 250 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60, maxWidth: 600, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, letterSpacing: 1.2 }}>EDIT PROFILE</Text>
            <Pressable onPress={onClose} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineMid }}>
              <X size={18} color={C.dim} strokeWidth={2.2} />
            </Pressable>
          </View>

          {/* Avatar */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Pressable onPress={pickPhoto} disabled={uploading}>
              <Avatar url={avatarUrl} name={name} username={username} size={96} ring />
              <View style={{ position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.amber, borderWidth: 2, borderColor: C.bg }}>
                {uploading ? <ActivityIndicator size="small" color={C.amberInk} /> : <Camera size={15} color={C.amberInk} strokeWidth={2.4} />}
              </View>
            </Pressable>
            <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint, marginTop: 10 }}>Tap to change your photo</Text>
          </View>

          {error && (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.red, lineHeight: 19 }}>{error}</Text>
            </View>
          )}

          <Field label="USERNAME">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, ...inputWrap }}>
              <Text style={{ fontFamily: F.body, fontSize: 15, color: C.faint }}>@</Text>
              <TextInput value={username} onChangeText={(v) => setUsername(cleanUsername(v))} placeholder="yourhandle" placeholderTextColor={C.faint2} autoCapitalize="none" autoComplete="off" style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 13 }} />
            </View>
          </Field>

          <Field label="NAME">
            <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.faint2} autoComplete="off" style={inputStyle} />
          </Field>

          <Field label="BIO">
            <TextInput value={bio} onChangeText={setBio} placeholder="A line about you" placeholderTextColor={C.faint2} autoComplete="off" multiline style={[inputStyle, { minHeight: 64, textAlignVertical: 'top' }]} maxLength={160} />
          </Field>

          <Field label="CITY">
            <TextInput value={city} onChangeText={setCity} placeholder="Where you're based" placeholderTextColor={C.faint2} autoComplete="off" style={inputStyle} />
          </Field>

          {/* Visibility */}
          <Text style={[sectionLabel, { marginTop: 6 }]}>WHO CAN SEE YOUR PROFILE</Text>
          <View style={{ gap: 10, marginBottom: 24 }}>
            <VisOption icon={Lock} active={visibility === 'private'} title="Private" desc="Only friends you accept can see your dream, streak, and goals." onPress={() => setVisibility('private')} />
            <VisOption icon={Globe} active={visibility === 'public'} title="Public" desc="Anyone on NorthStar can see your profile and find you." onPress={() => setVisibility('public')} />
          </View>

          <Pressable onPress={save} disabled={saving || uploading}>
            <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {saving && <ActivityIndicator size="small" color={C.amberInk} />}
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>{saving ? 'Saving…' : 'Save profile'}</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={sectionLabel}>{label}</Text>
      {children}
    </View>
  )
}

function VisOption({ icon: Icon, active, title, desc, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: active ? 'rgba(245,158,11,0.1)' : C.violetFill07, borderWidth: 1, borderColor: active ? C.amber : C.lineMid }}>
      <Icon size={18} color={active ? C.amber : C.dim} strokeWidth={2.2} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: active ? C.amber : C.ink }}>{title}</Text>
        <Text style={{ fontFamily: F.body, fontSize: 12, color: C.dim, marginTop: 1, lineHeight: 17 }}>{desc}</Text>
      </View>
      {active && <Check size={18} color={C.amber} strokeWidth={2.6} />}
    </Pressable>
  )
}

const sectionLabel = { fontFamily: F.display, fontSize: 11, color: C.faint, letterSpacing: 2, marginBottom: 8 }
const inputWrap = { backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingHorizontal: 16 }
const inputStyle = { backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, fontFamily: F.body, fontSize: 15, color: C.ink }
