// claude-proxy — server-side proxy for the Anthropic API.
//
// WHY: shipping the Anthropic key in the app bundle (EXPO_PUBLIC_ANTHROPIC_API_KEY)
// lets anyone extract it and drain the account's credits. This function keeps the
// key on the server. verify_jwt is on, so only signed-in NorthStar users can call it.
//
// ACTIVATION (one-time): set the secret in Supabase, then the app's AI features work:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref wsgbnhiklczfiapqrnnf
// (or Dashboard → Project Settings → Edge Functions → Secrets)
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")

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

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "Server not configured: ANTHROPIC_API_KEY secret is not set." }, 503)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const {
    prompt,
    messages,
    system,
    model = "claude-sonnet-4-6",
    max_tokens = 1024,
  } = payload as {
    prompt?: string
    messages?: unknown[]
    system?: string
    model?: string
    max_tokens?: number
  }

  // Clamp to keep a leaked/abused session from running up huge bills.
  const cappedTokens = Math.min(Math.max(Number(max_tokens) || 1024, 1), 4096)

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
    return json(data, r.status)
  } catch (e) {
    return json({ error: `Upstream request failed: ${(e as Error)?.message || e}` }, 502)
  }
})
