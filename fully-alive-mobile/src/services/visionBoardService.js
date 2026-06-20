// Vision Board Service
// Generates vision-board images via the server-side `openai-image-proxy` edge
// function — no user API key. Image gen is enabled once an OPENAI_API_KEY secret
// is set on Supabase; until then the proxy returns 503 and we surface it cleanly.
import { getSession, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseAuth'

const IMAGE_PROXY_URL = `${SUPABASE_URL}/functions/v1/openai-image-proxy`

// Image cache to avoid duplicate calls
const imageCache = new Map()

export async function generateVisionBoardImage(keyword, model = 'dall-e-3', retries = 2) {
  const cacheKey = `${keyword}:${model}`
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)
  }

  const session = await getSession()
  const token = session?.access_token
  if (!token) {
    throw new Error('Not signed in.')
  }

  let lastError = null

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(IMAGE_PROXY_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ keyword, model }),
      })

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error('Vision board images aren’t available yet.')
        } else if (response.status === 429) {
          if (attempt < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 10000 + Math.random() * 5000))
            continue
          }
          throw new Error('Image service is busy. Try again in a few minutes.')
        } else if (response.status >= 500) {
          if (attempt < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000))
            continue
          }
          throw new Error('Image service temporarily unavailable.')
        }
        throw new Error(`Image error: ${response.status}`)
      }

      const data = await response.json()
      if (!data.imageUrl) {
        throw new Error('Invalid response from image service')
      }

      const imageUrl = data.imageUrl

      // Cache the result
      imageCache.set(cacheKey, {
        imageUrl,
        keyword,
        generatedAt: new Date().toISOString(),
      })

      return {
        imageUrl,
        keyword,
        generatedAt: new Date().toISOString(),
      }
    } catch (error) {
      lastError = error

      if (error.message.includes('available yet')) {
        throw error // Don't retry when image generation isn't enabled
      }

      if (attempt < retries - 1) {
        console.warn(`Image attempt ${attempt + 1} failed, retrying...`)
      }
    }
  }

  console.error('Failed to generate vision board image after retries:', lastError)
  throw lastError || new Error('Could not generate image. Try again.')
}

// Generate multiple images for a goal based on keywords
export async function generateVisionBoardForGoal(keywords) {
  if (!keywords || keywords.length === 0) {
    throw new Error('No keywords provided for vision board')
  }

  const images = []
  const errors = []

  for (let i = 0; i < keywords.length; i++) {
    try {
      const keywordObj = keywords[i]
      const keyword = typeof keywordObj === 'string' ? keywordObj : keywordObj.keyword

      const image = await generateVisionBoardImage(keyword)
      images.push(image)

      // Add delay between calls to avoid rate limiting (longer gap to be safe)
      if (i < keywords.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000))
      }
    } catch (error) {
      errors.push({
        keyword: typeof keywords[i] === 'string' ? keywords[i] : keywords[i].keyword,
        error: error?.message || 'Unknown error',
      })
      console.warn(`Failed to generate image for keyword ${i + 1}/${keywords.length}:`, error?.message)
    }
  }

  if (images.length === 0 && errors.length > 0) {
    throw new Error(`Could not generate any vision board images: ${errors[0]?.error || 'Unknown error'}`)
  }

  return {
    images,
    errors,
    successCount: images.length,
    totalCount: keywords.length,
  }
}

// Clear the image cache (useful for memory management)
export function clearImageCache() {
  imageCache.clear()
}

// Get cache stats
export function getCacheStats() {
  return {
    cachedKeywords: imageCache.size,
    cachedItems: Array.from(imageCache.entries()),
  }
}

export default {
  generateVisionBoardImage,
  generateVisionBoardForGoal,
  clearImageCache,
  getCacheStats,
}
