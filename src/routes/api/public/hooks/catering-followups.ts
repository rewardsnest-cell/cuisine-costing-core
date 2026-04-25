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
import { sendOutlookEmail } from '@/lib/outlook/send'

type DB = SupabaseClient<Database>

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

  // Idempotency: race-safe insert-first claim. A partial unique index on
  // (lead_id, template_name, sent_at::date) where direction='outbound'
  // guarantees that even if two cron runs fire concurrently, only one will
  // succeed in creating the log row — the other gets a unique-violation
  // (Postgres error code 23505) and we skip the send.
  const sentAt = new Date().toISOString()
  const { render } = await import('@react-email/components')
  const templateData = {
    contactName: contact.name ?? undefined,
    businessName: contact.company ?? '',
  }
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const plainText = await render(element, { plainText: true })
  const subject = typeof template.subject === 'function'
    ? template.subject(templateData)
    : template.subject

  // Step 1 — claim the daily slot by inserting the log row FIRST.
  const { data: claimed, error: claimErr } = await supabase
    .from('lead_emails')
    .insert({
      lead_id: contact.id,
      direction: 'outbound',
      from_email: 'outlook@self',
      to_emails: [recipient],
      subject,
      body_preview: plainText.slice(0, 250),
      body_html: html,
      body_text: plainText,
      sent_at: sentAt,
      template_name: cfg.template,
    })
    .select('id')
    .maybeSingle()

  if (claimErr) {
    if (claimErr.code === '23505') {
      // Another run already sent this stage today → idempotent skip.
      return { ok: false, messageId, error: 'already-sent-today' }
    }
    return { ok: false, messageId, error: `claim failed: ${claimErr.message}` }
  }

  // Step 2 — slot claimed; perform the actual send.
  const result = await sendOutlookEmail({
    to: recipient,
    subject,
    html,
    text: plainText,
  })

  if (!result.ok) {
    // Roll back the claim so a later run can retry this stage today.
    if (claimed?.id) {
      await supabase.from('lead_emails').delete().eq('id', claimed.id)
    }
    return { ok: false, messageId, error: result.error || `outlook status ${result.status}` }
  }

  return { ok: true, messageId }
}

async function processStage(
  supabase: DB,
  stage: Stage,
): Promise<{ stage: Stage; processed: number; sent: number; failed: number }> {
  const cfg = STAGE_CONFIG[stage]
  let query = supabase
    .from('leads')
    .select('id, company, name, email, status, first_outreach_date, last_outreach_date')
    .eq('lead_type', 'catering')
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

  const MAX_ATTEMPTS = 3
  // Backoff: 500ms, 2s. Total worst-case ~2.5s extra per failing contact.
  const BACKOFF_MS = [500, 2000]

  // Errors we should NOT retry — they will never succeed on a re-attempt.
  const PERMANENT_PATTERNS = [
    'already-sent-today',     // idempotency win — duplicate detected
    'Template ',              // template not registered
    'invalid recipient',      // bad email address
    '550 ',                   // Outlook permanent reject
    '5.1.1',                  // mailbox does not exist
    '5.7.1',                  // message refused
  ]
  const isTransient = (err: string | undefined): boolean => {
    if (!err) return false
    return !PERMANENT_PATTERNS.some((p) => err.includes(p))
  }

  let sent = 0
  let failed = 0
  for (const c of (contacts ?? []) as unknown as Contact[]) {
    let lastResult: { ok: boolean; messageId: string; error?: string } = {
      ok: false,
      messageId: '',
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      lastResult = await enqueueEmail(supabase, c, stage)

      const isFinal = lastResult.ok
        || attempt === MAX_ATTEMPTS
        || !isTransient(lastResult.error)

      // Log every attempt — failed retries get status='retrying',
      // the final outcome gets 'sent' / 'failed' / 'skipped'.
      const logStatus = lastResult.ok
        ? 'sent'
        : isFinal
          ? (lastResult.error === 'already-sent-today' ? 'skipped' : 'failed')
          : 'retrying'

      await supabase.from('lead_outreach_log').insert({
        lead_id: c.id,
        channel: 'email',
        template_name: cfg.template,
        recipient_email: c.email,
        status: logStatus,
        message_id: lastResult.messageId,
        error_message: lastResult.error,
        attempt,
        max_attempts: MAX_ATTEMPTS,
        notes: `Auto: ${cfg.label}${attempt > 1 ? ` (retry ${attempt - 1})` : ''}`,
      })

      if (isFinal) break
      // Wait before next attempt — backoff array is 0-indexed by retry number.
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1] ?? 2000))
    }

    if (lastResult.ok) {
      sent++
      const update: Database['public']['Tables']['leads']['Update'] = {
        status: cfg.nextStatus,
        last_outreach_date: daysAgo(0),
        last_channel: 'email',
      }
      if (!c.first_outreach_date) update.first_outreach_date = daysAgo(0)
      update.next_follow_up_date = cfg.nextFollowUpDays !== null
        ? daysAhead(cfg.nextFollowUpDays)
        : null
      await supabase.from('leads').update(update).eq('id', c.id)
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
