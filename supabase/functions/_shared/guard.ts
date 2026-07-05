// Shared security guard for the AI proxies (claude-proxy, openai-image-proxy).
//
// It does the two things a proxy in front of a paid API must do:
//   1. Require a REAL signed-in NorthStar user — the JWT is validated server-side
//      via admin.auth.getUser(token). The public/anon key and unauthenticated
//      callers are rejected (401). This closes the open-proxy hole: possessing the
//      app-embedded publishable key is no longer enough to use the AI.
//   2. Per-user hourly rate limit via the bump_ai_usage() SQL function, so no one
//      user (or a stolen session) can run up a large bill.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

// CORS: if ALLOWED_ORIGINS (comma-separated) is set, echo only allowed origins;
// otherwise allow all. With the JWT gate below, a wide origin can do nothing
// without a valid user token — but set ALLOWED_ORIGINS in production to be strict.
export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",").map((s) => s.trim()).filter(Boolean)
  const allow = allowed.length === 0 ? "*" : (origin && allowed.includes(origin) ? origin : allowed[0])
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

export function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "content-type": "application/json" },
  })
}

type GuardResult = { user: { id: string; email?: string } } | { response: Response }

// Verify the caller and apply the per-user rate limit. On failure, returns a
// `response` to send immediately; on success, returns the authenticated `user`.
export async function requireUser(
  req: Request,
  origin: string | null,
  rateLimitPerHour: number,
): Promise<GuardResult> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { response: jsonResponse({ error: "Server not configured for auth." }, 503, origin) }
  }

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim()
  if (!token) return { response: jsonResponse({ error: "Unauthorized" }, 401, origin) }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // getUser() only succeeds for a genuine user access token. The publishable/anon
  // key resolves to no user and is therefore rejected here.
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { response: jsonResponse({ error: "Unauthorized" }, 401, origin) }

  // Per-user hourly cap. Fails OPEN only if the limiter itself errors (e.g. the
  // migration hasn't been applied yet) — the JWT gate above always holds.
  try {
    const { data: underLimit, error: rlErr } = await admin.rpc("bump_ai_usage", {
      uid: user.id,
      max_per_hour: rateLimitPerHour,
    })
    if (!rlErr && underLimit === false) {
      return { response: jsonResponse({ error: "Rate limit exceeded. Please try again later." }, 429, origin) }
    }
  } catch (_) {
    /* limiter unavailable — allow the call; the JWT check still protects us */
  }

  return { user: { id: user.id, email: user.email } }
}
