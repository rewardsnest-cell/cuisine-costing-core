import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

/**
 * Send a one-off email to a lead via the connected Outlook mailbox and log
 * the send to lead_emails + lead_activity. Reused by the lead detail page
 * and by the "Compose from Outlook" quick-action on the leads list.
 */
export const sendLeadEmail = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      leadId: z.string().uuid(),
      to: z.string().email(),
      subject: z.string().min(1).max(998),
      body: z.string().min(1).max(50000),
    }),
  )
  .handler(async ({ data }) => {
    const { sendOutlookEmail } = await import('@/lib/outlook/send')
    const { createClient } = await import('@supabase/supabase-js')

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return { ok: false as const, error: 'Server config error' }
    }
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const attemptedAt = new Date()
    const t0 = Date.now()
    const result = await sendOutlookEmail({
      to: data.to,
      subject: data.subject,
      text: data.body,
    })
    const completedAt = new Date()
    const durationMs = Date.now() - t0
    const sentAt = completedAt.toISOString()

    // Always log the attempt to lead_emails so failures are visible too.
    const { data: emailRow } = await sb
      .from('lead_emails')
      .insert({
        lead_id: data.leadId,
        direction: 'outbound',
        from_email: 'outlook@self',
        to_emails: [data.to],
        subject: data.subject,
        body_text: data.body,
        body_preview: data.body.slice(0, 250),
        sent_at: sentAt,
        template_name: 'manual',
      })
      .select('id')
      .maybeSingle()

    // Granular audit row for every Outlook attempt (sent or failed).
    await sb.from('lead_email_audit').insert({
      lead_id: data.leadId,
      lead_email_id: emailRow?.id ?? null,
      recipient: data.to,
      subject: data.subject,
      body_preview: data.body.slice(0, 250),
      source: 'manual',
      template_name: 'manual',
      status: result.ok ? 'sent' : 'failed',
      http_status: result.status,
      error_message: result.ok ? null : result.error || `status ${result.status}`,
      attempted_at: attemptedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      metadata: { channel: 'outlook' } as any,
    })

    if (!result.ok) {
      await sb.from('lead_activity').insert({
        lead_id: data.leadId,
        action: 'email_failed',
        summary: `Outlook send failed: ${result.error || `status ${result.status}`}`,
        metadata: { to: data.to, subject: data.subject, http_status: result.status, duration_ms: durationMs } as any,
      })
      return {
        ok: false as const,
        error: result.error || `status ${result.status}`,
      }
    }

    await sb.from('lead_activity').insert({
      lead_id: data.leadId,
      action: 'email_sent',
      summary: `Email sent via Outlook: "${data.subject}"`,
      metadata: { to: data.to, subject: data.subject, channel: 'outlook', http_status: result.status, duration_ms: durationMs } as any,
    })

    await sb
      .from('leads')
      .update({
        last_outreach_date: sentAt.slice(0, 10),
        last_contact_date: sentAt.slice(0, 10),
        last_channel: 'email',
      })
      .eq('id', data.leadId)

    return { ok: true as const }
  })
