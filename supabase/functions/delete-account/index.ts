// delete-account — permanently deletes the calling user's account.
//
// The mobile app holds only the publishable/anon key and cannot delete an
// auth.users row. This function runs with the service-role key (auto-injected by
// Supabase) and deletes ONLY the user identified by the verified JWT — never a
// user id from the request body — so one user can't delete another. Deleting the
// auth user cascades public.user_state (FK ON DELETE CASCADE).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Missing authorization' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Derive the user from the verified token — never trust a body-supplied id.
    const { data: { user }, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !user) return json({ error: 'Invalid session' }, 401)

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) return json({ error: delErr.message }, 500)

    return json({ success: true }, 200)
  } catch (e) {
    return json({ error: (e as Error)?.message || 'Unexpected error' }, 500)
  }
})
