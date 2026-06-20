// openai-image-proxy — server-side proxy for OpenAI image generation (vision board).
// Keeps the OpenAI key on the server. verify_jwt is on, so only signed-in users can call it.
//
// ACTIVATION (optional — enables vision-board images):
//   supabase secrets set OPENAI_API_KEY=sk-... --project-ref wsgbnhiklczfiapqrnnf
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } })

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  // Not configured yet — the client treats this as "image generation unavailable".
  if (!OPENAI_API_KEY) return json({ error: "Image generation is not enabled." }, 503)

  let payload: { keyword?: string; size?: string; model?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const keyword = String(payload.keyword ?? "").trim()
  if (!keyword) return json({ error: "Missing keyword" }, 400)

  const prompt = `Create a visually inspiring, professional image representing: "${keyword}".
Make it beautiful, motivational, and suitable for a vision board.
Style: modern, vibrant, empowering. High quality.`

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: payload.model || "dall-e-3",
        prompt,
        n: 1,
        size: payload.size || "1024x1024",
        quality: "hd",
      }),
    })
    const data = await r.json()
    if (!r.ok) return json({ error: data?.error?.message || `OpenAI error ${r.status}` }, r.status)
    const imageUrl = data?.data?.[0]?.url
    if (!imageUrl) return json({ error: "No image returned" }, 502)
    return json({ imageUrl })
  } catch (e) {
    return json({ error: `Upstream request failed: ${(e as Error)?.message || e}` }, 502)
  }
})
