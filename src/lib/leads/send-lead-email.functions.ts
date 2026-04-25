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
      /** Storage references for attachments uploaded to lead-email-attachments. */
      attachments: z
        .array(
          z.object({
            storagePath: z.string().min(1).max(500),
            fileName: z.string().min(1).max(255),
            contentType: z.string().min(1).max(120),
            sizeBytes: z.number().int().nonnegative().max(25 * 1024 * 1024),
          }),
        )
        .max(10)
        .optional(),
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

    // Pull each attachment's bytes from storage and base64-encode for Graph.
    const outlookAttachments: Array<{
      name: string
      contentType: string
      contentBytesBase64: string
    }> = []
    const attMeta = data.attachments ?? []
    for (const a of attMeta) {
      const dl = await sb.storage.from('lead-email-attachments').download(a.storagePath)
      if (dl.error || !dl.data) {
        return {
          ok: false as const,
          error: `Failed to read attachment "${a.fileName}": ${dl.error?.message ?? 'unknown error'}`,
        }
      }
      const buf = Buffer.from(await dl.data.arrayBuffer())
      // Outlook fileAttachment has a ~3 MB practical inline limit.
      if (buf.byteLength > 3 * 1024 * 1024) {
        return {
          ok: false as const,
          error: `Attachment "${a.fileName}" exceeds 3 MB Outlook inline limit`,
        }
      }
      outlookAttachments.push({
        name: a.fileName,
        contentType: a.contentType,
        contentBytesBase64: buf.toString('base64'),
      })
    }

    const attemptedAt = new Date()
    const t0 = Date.now()
    const result = await sendOutlookEmail({
      to: data.to,
      subject: data.subject,
      text: data.body,
      attachments: outlookAttachments.length > 0 ? outlookAttachments : undefined,
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
        outlook_message_id: result.outlookMessageId ?? null,
        outlook_conversation_id: result.outlookConversationId ?? null,
        internet_message_id: result.internetMessageId ?? null,
      })
      .select('id')
      .maybeSingle()

    // Persist attachment rows linked to the email log entry, even on partial failures,
    // so the audit trail captures what was uploaded.
    if (attMeta.length > 0) {
      const idByName = new Map(
        (result.attachmentIds ?? []).map((a) => [a.name, a.outlookAttachmentId] as const),
      )
      const rows = attMeta.map((a) => ({
        lead_email_id: emailRow?.id ?? null,
        lead_id: data.leadId,
        storage_bucket: 'lead-email-attachments',
        storage_path: a.storagePath,
        file_name: a.fileName,
        content_type: a.contentType,
        size_bytes: a.sizeBytes,
        outlook_attachment_id: idByName.get(a.fileName) ?? null,
      }))
      await sb.from('lead_email_attachments').insert(rows)
    }

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
      metadata: {
        channel: 'outlook',
        outlook_message_id: result.outlookMessageId,
        outlook_conversation_id: result.outlookConversationId,
        internet_message_id: result.internetMessageId,
        attachments_count: attMeta.length,
        attachment_names: attMeta.map((a) => a.fileName),
      } as any,
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
      summary: `Email sent via Outlook: "${data.subject}"${attMeta.length > 0 ? ` (${attMeta.length} attachment${attMeta.length === 1 ? '' : 's'})` : ''}`,
      metadata: {
        to: data.to,
        subject: data.subject,
        channel: 'outlook',
        http_status: result.status,
        duration_ms: durationMs,
        attachments: attMeta.map((a) => ({ name: a.fileName, size: a.sizeBytes })),
      } as any,
    })

    await sb
      .from('leads')
      .update({
        last_outreach_date: sentAt.slice(0, 10),
        last_contact_date: sentAt.slice(0, 10),
        last_channel: 'email',
      })
      .eq('id', data.leadId)

    return { ok: true as const, attachmentsCount: attMeta.length }
  })
