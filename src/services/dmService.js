// Direct messages — 1:1 and group conversations on the conversations/members/
// messages schema. RLS limits everything to conversations you're a member of.
import { getSupabaseClient } from './supabaseAuth'
import { getIdentities } from './socialService'

// List my conversations, newest-activity first, enriched with member identities
// and a last-message preview.
export async function getConversations(myId) {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('conversations')
      .select('id,is_group,title,created_at,members:conversation_members(user_id),messages(content,created_at,sender_id)')
    if (error) throw error

    const convos = data || []
    const allIds = Array.from(new Set(convos.flatMap((c) => (c.members || []).map((m) => m.user_id)).filter((id) => id !== myId)))
    const idents = await getIdentities(allIds)
    const byId = {}
    idents.forEach((i) => { byId[i.id] = i })

    return convos
      .map((c) => {
        const msgs = (c.messages || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        const last = msgs[0] || null
        const others = (c.members || []).map((m) => m.user_id).filter((id) => id !== myId).map((id) => byId[id]).filter(Boolean)
        return {
          id: c.id,
          isGroup: c.is_group,
          title: c.title,
          others,
          lastMessage: last?.content || null,
          lastAt: last?.created_at || c.created_at,
        }
      })
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))
  } catch (e) {
    console.warn('[DM] getConversations failed:', e?.message)
    return []
  }
}

export async function getMessages(conversationId) {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('messages')
      .select('id,sender_id,content,created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[DM] getMessages failed:', e?.message)
    return []
  }
}

export async function sendMessage(conversationId, myId, content) {
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: myId, content: content.trim() })
    if (error) throw error
    return { error: null }
  } catch (e) {
    console.error('[DM] sendMessage failed:', e?.message)
    return { error: e?.message || 'Could not send' }
  }
}

// Find or start the 1:1 conversation with another user. Returns conversationId.
export async function openDm(otherUserId) {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.rpc('get_or_create_dm', { other: otherUserId })
    if (error) throw error
    return { conversationId: data, error: null }
  } catch (e) {
    console.error('[DM] openDm failed:', e?.message)
    return { conversationId: null, error: e?.message || 'Could not open chat' }
  }
}

// Create a group conversation with a set of friends.
export async function createGroup(title, memberIds, myId) {
  try {
    const supabase = getSupabaseClient()
    const { data: conv, error: cErr } = await supabase
      .from('conversations').insert({ is_group: true, title: title?.trim() || 'Group', created_by: myId }).select('id').single()
    if (cErr) throw cErr
    const rows = Array.from(new Set([myId, ...memberIds])).map((uid) => ({ conversation_id: conv.id, user_id: uid }))
    const { error: mErr } = await supabase.from('conversation_members').insert(rows)
    if (mErr) throw mErr
    return { conversationId: conv.id, error: null }
  } catch (e) {
    console.error('[DM] createGroup failed:', e?.message)
    return { conversationId: null, error: e?.message || 'Could not create group' }
  }
}

export default { getConversations, getMessages, sendMessage, openDm, createGroup }
