import { Platform } from 'react-native'
import { moderateImage } from './aiService'

// One screening pipeline for every user-uploaded image — feed posts and profile
// pictures go through the SAME checks: downscale locally, send the thumbnail to
// the vision moderator, and FAIL CLOSED (nothing unverifiable gets uploaded).

// Build a SMALL base64 JPEG (no data: prefix) from a picked photo, or a frame
// sampled from a video, so media can be screened before it's uploaded. Web only
// (canvas) and kept tiny so it fits the AI proxy's input cap. Returns null if it
// can't produce one (native / decode failure) — the caller then holds the media
// back rather than uploading it unscreened.
export async function makeModerationThumbnail(uri, type) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v) } }
    const timer = setTimeout(() => finish(null), 8000) // never hang an upload on this
    const draw = (el, w, h) => {
      try {
        const MAX = 256
        const scale = Math.min(1, MAX / Math.max(w || MAX, h || MAX))
        const cw = Math.max(1, Math.round((w || MAX) * scale))
        const ch = Math.max(1, Math.round((h || MAX) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw; canvas.height = ch
        canvas.getContext('2d').drawImage(el, 0, 0, cw, ch)
        finish((canvas.toDataURL('image/jpeg', 0.5).split(',')[1]) || null)
      } catch { finish(null) }
    }
    try {
      if (type === 'video') {
        const v = document.createElement('video')
        v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = uri
        v.onloadeddata = () => { try { v.currentTime = Math.min(0.6, (v.duration || 2) / 3) } catch { draw(v, v.videoWidth, v.videoHeight) } }
        v.onseeked = () => draw(v, v.videoWidth, v.videoHeight)
        v.onerror = () => finish(null)
      } else {
        const img = new window.Image()
        img.onload = () => draw(img, img.naturalWidth, img.naturalHeight)
        img.onerror = () => finish(null)
        img.src = uri
      }
    } catch { finish(null) }
  })
}

// Screen a picked photo/video before upload. Fail CLOSED: `ok` only when the
// moderator actually checked it AND cleared it. `violation` distinguishes an
// explicit block (show `reason`) from a couldn't-verify (ask to retry), and
// `unsupported` marks platforms where screening can't run AT ALL (native has no
// canvas) — callers should say so honestly instead of suggesting a retry that
// can never succeed.
export async function screenMediaForUpload(uri, type) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return { ok: false, violation: false, reason: null, unsupported: true }
  }
  const thumb = await makeModerationThumbnail(uri, type)
  const verdict = await moderateImage(thumb, type)
  const ok = !!(verdict && verdict.checked === true && verdict.allowed === true)
  return {
    ok,
    violation: !!(verdict && verdict.allowed === false),
    reason: (verdict && verdict.reason) || null,
    unsupported: false,
  }
}
