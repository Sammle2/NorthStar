// claude-proxy — hardened server-side proxy for the Anthropic API.
//
// WHY: shipping the Anthropic key in the app bundle lets anyone extract it and
// drain the account's credits. This function keeps the key on the server AND
// (via _shared/guard) only lets REAL signed-in NorthStar users through — the
// public/anon key alone is not enough. It also rate-limits per user and bounds
// the cost of each call (model allowlist + input/output caps).
//
// ACTIVATION (one-time):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref wsgbnhiklczfiapqrnnf
//   supabase db push                 # creates the bump_ai_usage rate limiter
//   supabase functions deploy claude-proxy
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders, jsonResponse, requireUser } from "../_shared/guard.ts"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")

// Only models the app actually uses may be requested — no arbitrary/expensive picks.
const ALLOWED_MODELS = new Set(["claude-sonnet-4-6", "claude-haiku-4-5-20251001"])
const DEFAULT_MODEL = "claude-sonnet-4-6"
const MAX_INPUT_CHARS = 24_000 // ~6k tokens of input; blocks oversized prompts
const MAX_OUTPUT_TOKENS = 4096
const RATE_LIMIT_PER_HOUR = 60

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin)
  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: "Server not configured: ANTHROPIC_API_KEY secret is not set." }, 503, origin)
  }

  // Auth + rate limit. Returns a ready-made response on any failure.
  const gate = await requireUser(req, origin, RATE_LIMIT_PER_HOUR)
  if ("response" in gate) return gate.response

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin)
  }

  const { prompt, messages, system } = payload as {
    prompt?: string
    messages?: unknown[]
    system?: string
  }

  // Model allowlist — fall back to the default for anything not permitted.
  const requested = String((payload as { model?: string }).model || DEFAULT_MODEL)
  const model = ALLOWED_MODELS.has(requested) ? requested : DEFAULT_MODEL

  // Input-size cap (input tokens are billed too).
  const inputStr = JSON.stringify(messages ?? prompt ?? "")
  if (inputStr.length > MAX_INPUT_CHARS) return jsonResponse({ error: "Request too large" }, 413, origin)

  // Output cap.
  const cappedTokens = Math.min(
    Math.max(Number((payload as { max_tokens?: number }).max_tokens) || 1024, 1),
    MAX_OUTPUT_TOKENS,
  )

  const body: Record<string, unknown> = {
    model,
    max_tokens: cappedTokens,
    messages: Array.isArray(messages) && messages.length
      ? messages
      : [{ role: "user", content: String(prompt ?? "") }],
  }
  if (system) body.system = system

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
    const data = await r.json()
    return jsonResponse(data, r.status, origin)
  } catch (e) {
    return jsonResponse({ error: `Upstream request failed: ${(e as Error)?.message || e}` }, 502, origin)
  }
})
