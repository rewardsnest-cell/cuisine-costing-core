/**
 * Standard Catering Outreach Follow-Up cron route.
 *
 * Schedule (Aurora, OH local catering pipeline):
 *  - Day 0  → status='new', no first_outreach_date → send `prospect-followup-day0` (intro)
 *  - Day 5  → status='contacted', last_outreach_date = today - 5 → send `prospect-followup-day5`
 *  - Day 14 → status='follow-up', last_outreach_date = today - 14 → send `prospect-followup-day14`
 *
 * After each successful enqueue:
 *  - Inserts a row in `local_catering_outreach_log`
 *  - Bumps the contact's `status`, `last_outreach_date`, `next_follow_up_date`
 *
 * Auth: simple shared-secret header `x-cron-secret` (env CATERING_CRON_SECRET).
 */
import { createFileRoute } from '@tanstack/react-router'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as React from 'react'
import type { Database } from '@/integrations/supabase/types'
import { TEMPLATES } from '@/lib/email-templates/registry'

type DB = SupabaseClient<Database>

const SITE_NAME = 'VPS Finest'
const SENDER_DOMAIN = 'notify.vpfinest.com'
const FROM_DOMAIN = 'notify.vpfinest.com'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysAhead(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

interface Contact {
  id: string
  company: string | null
  name: string | null
  email: string | null
  status: string
  first_outreach_date: string | null
  last_outreach_date: string | null
}

type Stage = 0 | 5 | 14

const STAGE_CONFIG: Record<Stage, {
  template: string
  nextStatus: string
  nextFollowUpDays: number | null
  label: string
}> = {
  0:  { template: 'prospect-followup-day0',  nextStatus: 'contacted',  nextFollowUpDays: 5,  label: 'Day 0 intro' },
  5:  { template: 'prospect-followup-day5',  nextStatus: 'follow-up',  nextFollowUpDays: 9,  label: 'Day 5 follow-up' },
  14: { template: 'prospect-followup-day14', nextStatus: 'follow-up',  nextFollowUpDays: null, label: 'Day 14 final touch' },
}

async function enqueueEmail(
  supabase: DB,
  contact: Contact,
  stage: Stage,
): Promise<{ ok: boolean; messageId: string; error?: string }> {
  const cfg = STAGE_CONFIG[stage]
  const template = TEMPLATES[cfg.template]
  const messageId = crypto.randomUUID()
  const recipient = contact.email!

  if (!template) {
    return { ok: false, messageId, error: `Template ${cfg.template} not registered` }
  }

  // Suppression check
  const { data: suppressed } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', recipient.toLowerCase())
    .maybeSingle()

  if (suppressed) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: cfg.template,
      recipient_email: recipient,
      status: 'suppressed',
    })
    return { ok: false, messageId, error: 'suppressed' }
  }

  // Unsubscribe token
  const normalized = recipient.toLowerCase()
  let unsubscribeToken: string
  const { data: existingToken } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalized)
    .maybeSingle()

  if (existingToken && !(existingToken as any).used_at) {
    unsubscribeToken = (existingToken as any).token
  } else {
    unsubscribeToken = generateToken()
    await supabase
      .from('email_unsubscribe_tokens')
      .upsert({ token: unsubscribeToken, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
    const { data: stored } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalized)
      .maybeSingle()
    if (stored) unsubscribeToken = (stored as any).token
  }

  // Render
  const { render } = await import('@react-email/components')
  const templateData = {
    contactName: contact.contact_name ?? undefined,
    businessName: contact.organization_name,
  }
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const plainText = await render(element, { plainText: true })
  const subject = typeof template.subject === 'function'
    ? template.subject(templateData)
    : template.subject

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: cfg.template,
    recipient_email: recipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: cfg.template,
      idempotency_key: `lcc-${stage}-${contact.id}-${daysAgo(0)}`,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: cfg.template,
      recipient_email: recipient,
      status: 'failed',
      error_message: enqueueError.message,
    })
    return { ok: false, messageId, error: enqueueError.message }
  }

  return { ok: true, messageId }
}

async function processStage(
  supabase: DB,
  stage: Stage,
): Promise<{ stage: Stage; processed: number; sent: number; failed: number }> {
  const cfg = STAGE_CONFIG[stage]
  let query = supabase
    .from('local_catering_contacts')
    .select('id, organization_name, contact_name, email, status, first_outreach_date, last_outreach_date')
    .not('email', 'is', null)
    .neq('status', 'not-interested')
    .neq('status', 'booked')
    .neq('status', 'repeat')

  if (stage === 0) {
    query = query.eq('status', 'new').is('first_outreach_date', null)
  } else if (stage === 5) {
    query = query.eq('status', 'contacted').eq('last_outreach_date', daysAgo(5))
  } else {
    query = query.eq('status', 'follow-up').eq('last_outreach_date', daysAgo(14))
  }

  const { data: contacts, error } = await query.limit(100)
  if (error) {
    console.error(`[catering-followups] stage ${stage} fetch failed:`, error)
    return { stage, processed: 0, sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0
  for (const c of (contacts ?? []) as Contact[]) {
    const result = await enqueueEmail(supabase, c, stage)

    await supabase.from('local_catering_outreach_log').insert({
      contact_id: c.id,
      channel: 'email',
      template_name: cfg.template,
      recipient_email: c.email,
      status: result.ok ? 'queued' : 'failed',
      message_id: result.messageId,
      error_message: result.error,
      notes: `Auto: ${cfg.label}`,
    })

    if (result.ok) {
      sent++
      const update: Database['public']['Tables']['local_catering_contacts']['Update'] = {
        status: cfg.nextStatus,
        last_outreach_date: daysAgo(0),
        last_channel: 'email',
      }
      if (!c.first_outreach_date) update.first_outreach_date = daysAgo(0)
      update.next_follow_up_date = cfg.nextFollowUpDays !== null
        ? daysAhead(cfg.nextFollowUpDays)
        : null
      await supabase.from('local_catering_contacts').update(update).eq('id', c.id)
    } else {
      failed++
    }
  }

  return { stage, processed: contacts?.length ?? 0, sent, failed }
}

export const Route = createFileRoute('/api/public/hooks/catering-followups')({
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
          const results = await Promise.all([
            processStage(supabase, 0),
            processStage(supabase, 5),
            processStage(supabase, 14),
          ])

          return Response.json({
            success: true,
            ran_at: new Date().toISOString(),
            results,
          })
        } catch (err: any) {
          console.error('[catering-followups] fatal:', err)
          return Response.json(
            { error: err?.message ?? 'Internal error' },
            { status: 500 },
          )
        }
      },
    },
  },
})
