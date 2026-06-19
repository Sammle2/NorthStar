// Account service — permanent account deletion (Apple Guideline 5.1.1(v)).
//
// Calls the `delete-account` edge function, which runs with the service-role key
// and deletes ONLY the user identified by the session JWT (supabase-js attaches it
// automatically). Deleting the auth user cascades the user_state row.
import { getSupabaseClient } from './supabaseAuth'

// Returns { error: string | null }.
export async function deleteAccount() {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.functions.invoke('delete-account')
    if (error) throw error
    if (data && data.error) throw new Error(data.error)
    return { error: null }
  } catch (e) {
    console.error('Account deletion failed:', e?.message)
    return { error: e?.message || 'Could not delete account. Try again.' }
  }
}

export default { deleteAccount }
