// openai-image-proxy — hardened proxy for OpenAI image generation (vision board).
//
// Same security model as claude-proxy: keeps the OpenAI key on the server, only
// lets real signed-in users through (via _shared/guard), rate-limits per user,
// and constrains model/size + prompt length. Dormant until OPENAI_API_KEY is set.
//
// ACTIVATION (optional):
//   supabase secrets set OPENAI_API_KEY=sk-... --project-ref wsgbnhiklczfiapqrnnf
//   supabase functions deploy openai-image-proxy
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders, jsonResponse, requireUser } from "../_shared/guard.ts"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

const ALLOWED_MODELS = new Set(["dall-e-3", "dall-e-2"])
const ALLOWED_SIZES = new Set(["1024x1024", "1024x1792", "1792x1024", "512x512", "256x256"])
const MAX_KEYWORD_CHARS = 300
const RATE_LIMIT_PER_HOUR = 30

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin)

  // Not configured yet — the client treats this as "image generation unavailable".
  if (!OPENAI_API_KEY) return jsonResponse({ error: "Image generation is not enabled." }, 503, origin)

  // Auth + rate limit.
  const gate = await requireUser(req, origin, RATE_LIMIT_PER_HOUR)
  if ("response" in gate) return gate.response

  let payload: { keyword?: string; size?: string; model?: string }
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin)
  }

  const keyword = String(payload.keyword ?? "").trim()
  if (!keyword) return jsonResponse({ error: "Missing keyword" }, 400, origin)
  if (keyword.length > MAX_KEYWORD_CHARS) return jsonResponse({ error: "Keyword too long" }, 413, origin)

  const model = ALLOWED_MODELS.has(String(payload.model)) ? String(payload.model) : "dall-e-3"
  const size = ALLOWED_SIZES.has(String(payload.size)) ? String(payload.size) : "1024x1024"

  // Prompt is composed server-side; the client only supplies the keyword.
  const prompt = `Create a visually inspiring, professional image representing: "${keyword}".
Make it beautiful, motivational, and suitable for a vision board.
Style: modern, vibrant, empowering. High quality.`

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, n: 1, size, quality: "hd" }),
    })
    const data = await r.json()
    if (!r.ok) return jsonResponse({ error: data?.error?.message || `OpenAI error ${r.status}` }, r.status, origin)
    const imageUrl = data?.data?.[0]?.url
    if (!imageUrl) return jsonResponse({ error: "No image returned" }, 502, origin)
    return jsonResponse({ imageUrl }, 200, origin)
  } catch (e) {
    return jsonResponse({ error: `Upstream request failed: ${(e as Error)?.message || e}` }, 502, origin)
  }
})
