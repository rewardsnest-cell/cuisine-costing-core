/**
 * Outlook Inbox Poller cron route.
 *
 * - Reads new messages from the connected Outlook inbox via the gateway.
 * - Matches each sender's email (lowercased) against `leads.email`.
 * - Inserts a row in `lead_emails` (inbound).
 * - For matched leads: bumps status to 'replied', sets last_inbound_at, and
 *   logs a row in `lead_activity` so the reply is visible in the CRM.
 * - Updates `outlook_sync_state` with the latest received timestamp.
 *
 * Auth: shared-secret header `x-cron-secret` (env CATERING_CRON_SECRET).
 */
import { createFileRoute } from '@tanstack/react-router'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'
import { listInboxMessages, type OutlookMessage } from '@/lib/outlook/send'

type DB = SupabaseClient<Database>

interface PollResult {
  fetched: number
  inserted: number
  matchedToLeads: number
  errors: string[]
}

async function processMessages(
  supabase: DB,
  messages: OutlookMessage[],
): Promise<PollResult> {
  const result: PollResult = { fetched: messages.length, inserted: 0, matchedToLeads: 0, errors: [] }
  if (messages.length === 0) return result

  // Build a lowercase email → lead_id map for the senders we just fetched.
  const senderEmails = Array.from(
    new Set(
      messages
        .map((m) => m.from?.emailAddress?.address?.toLowerCase())
        .filter((e): e is string => !!e),
    ),
  )

  let leadByEmail = new Map<string, string>()
  if (senderEmails.length > 0) {
    const { data: matchedLeads } = await supabase
      .from('leads')
      .select('id, email')
      .in('email', senderEmails)
    for (const row of matchedLeads ?? []) {
      const e = (row as any).email?.toLowerCase()
      if (e) leadByEmail.set(e, (row as any).id as string)
    }
  }

  // Skip messages we've already imported (by Outlook message id).
  const messageIds = messages.map((m) => m.id)
  const { data: existing } = await supabase
    .from('lead_emails')
    .select('outlook_message_id')
    .in('outlook_message_id', messageIds)
  const seen = new Set((existing ?? []).map((r) => (r as any).outlook_message_id as string))

  let latestReceived: string | undefined

  for (const msg of messages) {
    if (seen.has(msg.id)) continue
    if (!latestReceived || msg.receivedDateTime > latestReceived) {
      latestReceived = msg.receivedDateTime
    }

    const fromEmail = msg.from?.emailAddress?.address?.toLowerCase() ?? ''
    const fromName = msg.from?.emailAddress?.name ?? null
    const leadId = fromEmail ? leadByEmail.get(fromEmail) ?? null : null

    const bodyContent = msg.body?.content ?? ''
    const isHtml = (msg.body?.contentType ?? '').toLowerCase() === 'html'

    const { error: insertError } = await supabase.from('lead_emails').insert({
      lead_id: leadId,
      direction: 'inbound',
      outlook_message_id: msg.id,
      outlook_conversation_id: msg.conversationId,
      internet_message_id: msg.internetMessageId,
      from_email: fromEmail,
      from_name: fromName,
      to_emails: (msg.toRecipients ?? []).map((r) => r.emailAddress.address),
      cc_emails: (msg.ccRecipients ?? []).map((r) => r.emailAddress.address),
      subject: msg.subject,
      body_preview: msg.bodyPreview,
      body_html: isHtml ? bodyContent : null,
      body_text: isHtml ? null : bodyContent,
      received_at: msg.receivedDateTime,
      is_read: msg.isRead,
    })

    if (insertError) {
      result.errors.push(`insert ${msg.id}: ${insertError.message}`)
      continue
    }
    result.inserted++

    if (leadId) {
      result.matchedToLeads++

      // Bump lead to 'replied' and update last_inbound_at + last_channel.
      await supabase
        .from('leads')
        .update({
          status: 'replied',
          last_channel: 'email',
          last_outreach_date: msg.receivedDateTime.slice(0, 10),
        })
        .eq('id', leadId)

      // Log activity (best-effort — table may have different columns).
      await supabase.from('lead_activity').insert({
        lead_id: leadId,
        activity_type: 'inbound_email',
        notes: `Outlook reply: ${msg.subject ?? '(no subject)'} — ${msg.bodyPreview.slice(0, 200)}`,
      } as any)
    }
  }

  // Update sync state
  if (latestReceived) {
    await supabase
      .from('outlook_sync_state')
      .update({
        last_polled_at: new Date().toISOString(),
        last_message_received_at: latestReceived,
        total_messages_synced: (await supabase
          .from('lead_emails')
          .select('id', { count: 'exact', head: true })
          .eq('direction', 'inbound')).count ?? 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
  } else {
    await supabase
      .from('outlook_sync_state')
      .update({ last_polled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', 1)
  }

  return result
}

export const Route = createFileRoute('/api/public/hooks/outlook-poll-inbox')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CATERING_CRON_SECRET
        const provided = request.headers.get('x-cron-secret')
        if (!expected || provided !== expected) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: 'Server config error' }, { status: 500 })
        }

        const supabase = createClient<Database>(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        try {
          // Fetch the last poll time so we only get new messages.
          const { data: state } = await supabase
            .from('outlook_sync_state')
            .select('last_message_received_at')
            .eq('id', 1)
            .maybeSingle()

          const since = (state as any)?.last_message_received_at ?? undefined
          const messages = await listInboxMessages({ since, top: 50 })
          const result = await processMessages(supabase, messages)

          return Response.json({ ok: true, ...result })
        } catch (err: any) {
          await supabase
            .from('outlook_sync_state')
            .update({
              last_polled_at: new Date().toISOString(),
              last_error: err?.message ?? String(err),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)
          return Response.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 })
        }
      },
    },
  },
})
