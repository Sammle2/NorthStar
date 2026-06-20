import React, { useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { ImagePlus, Plus, Sparkles, X } from 'lucide-react-native'
import { C, F } from '../tokens'
import { generateVisionBoardImage } from '../../services/visionBoardService'

// Vision Board — lives on the Dashboard (never its own tab). Add keywords for
// what the dream looks like, generate DALL·E images, and let them stack into a
// grid you can scroll. Images persist on profile.visionBoardImages.
export default function VisionBoard({ profile, onUpdate }) {
  const [keyword, setKeyword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const images = profile.visionBoardImages || []

  const generate = async () => {
    const kw = keyword.trim()
    if (!kw) return
    setBusy(true)
    setError(null)
    try {
      const result = await generateVisionBoardImage(kw)
      const next = [
        { id: `vb_${Date.now()}`, keyword: kw, image_url: result.imageUrl, created_at: result.generatedAt },
        ...images,
      ]
      onUpdate({ ...profile, visionBoardImages: next })
      setKeyword('')
    } catch (e) {
      setError(e.message || 'Could not generate that image. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const remove = (id) => {
    onUpdate({ ...profile, visionBoardImages: images.filter((img) => img.id !== id) })
  }

  return (
    <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
      {/* Section header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Sparkles size={14} color={C.violet} strokeWidth={2.2} />
        <Text style={{ fontFamily: F.display, fontSize: 12, color: C.faint, letterSpacing: 2.2 }}>VISION BOARD</Text>
      </View>

      <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, lineHeight: 20, marginBottom: 16 }}>
        What does your dream look like? Add a keyword — a place, an object, a feeling — and let it take shape.
      </Text>

      {/* Keyword input */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={generate}
          placeholder="Dubai skyline, a quiet cabin, the finish line…"
          placeholderTextColor={C.faint2}
          autoComplete="off"
          style={{
            flex: 1,
            backgroundColor: C.lineSoft,
            borderWidth: 1,
            borderColor: C.lineStrong,
            borderRadius: 12,
            paddingVertical: 13,
            paddingHorizontal: 16,
            fontFamily: F.body,
            fontSize: 14.5,
            color: C.ink,
          }}
        />
        <Pressable
          onPress={generate}
          disabled={busy}
          style={{
            width: 50,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: busy ? C.violetFill : C.violet,
          }}
        >
          {busy ? <ActivityIndicator color={C.violet} /> : <Plus size={20} color={C.amberInk} strokeWidth={2.6} />}
        </Pressable>
      </View>

      {error && (
        <Text style={{ fontFamily: F.body, fontSize: 12, color: C.red, marginBottom: 8 }}>{error}</Text>
      )}

      {/* Image grid */}
      {images.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
          {images.map((img) => (
            <View
              key={img.id}
              style={{
                width: '47.5%',
                aspectRatio: 1,
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: C.line,
              }}
            >
              <Image source={{ uri: img.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <Pressable
                onPress={() => remove(img.id)}
                hitSlop={8}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(7,7,15,0.7)',
                }}
              >
                <X size={14} color={C.ink} strokeWidth={2.4} />
              </Pressable>
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(7,7,15,0.66)' }}>
                <Text numberOfLines={1} style={{ fontFamily: F.medium, fontSize: 11, color: C.ink3 }}>{img.keyword}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View
          style={{
            marginTop: 8,
            borderRadius: 16,
            paddingVertical: 36,
            alignItems: 'center',
            gap: 10,
            backgroundColor: C.lineSoft,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: C.lineMid,
          }}
        >
          <ImagePlus size={26} color={C.faint} strokeWidth={1.8} />
          <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.faint }}>Your vision board is empty — add a keyword above.</Text>
        </View>
      )}
    </View>
  )
}
