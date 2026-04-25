import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import * as React from 'react'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'VPS Finest'
const SENDER_DOMAIN = 'notify.vpfinest.com'
const FROM_DOMAIN = 'notify.vpfinest.com'

function genToken() {
  const b = new Uint8Array(32); crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

export const Route = createFileRoute('/api/public/hooks/prospect-followups')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get('authorization')
        if (!auth?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 })

        const url = import.meta.env.VITE_SUPABASE_URL!
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return Response.json({ error: 'misconfigured' }, { status: 500 })
        const supabase = createClient(url, serviceKey)

        const today = new Date().toISOString().slice(0, 10)

        const { data: jobs, error } = await supabase
          .from('sales_followup_queue')
          .select('id, prospect_id, step, scheduled_for')
          .eq('status', 'pending')
          .lte('scheduled_for', today)
          .limit(50)
        if (error) return Response.json({ error: error.message }, { status: 500 })

        let processed = 0, sent = 0, skipped = 0, failed = 0

        for (const job of jobs || []) {
          processed++

          // Atomically claim the job: only one concurrent cron run can flip
          // status from 'pending' → 'processing'. Others get 0 rows and skip.
          const { data: claimed } = await supabase
            .from('sales_followup_queue')
            .update({ status: 'processing' })
            .eq('id', job.id)
            .eq('status', 'pending')
            .select('id')
            .maybeSingle()
          if (!claimed) { skipped++; continue }

          const { data: p } = await supabase
            .from('sales_prospects')
            .select('id, business_name, contact_name, email, status')
            .eq('id', job.prospect_id).maybeSingle()

          if (!p || !p.email || p.status === 'Booked' || p.status === 'Repeat' || p.status === 'Archived') {
            await supabase.from('sales_followup_queue').update({ status: 'skipped' }).eq('id', job.id)
            skipped++; continue
          }

          const templateName = job.step === 'day5' ? 'prospect-followup-day5' : 'prospect-followup-day14'

          try {
            await sendOne(supabase, {
              templateName,
              recipientEmail: p.email,
              templateData: { contactName: p.contact_name || undefined, businessName: p.business_name },
              idempotencyKey: `prospect-${p.id}-${job.step}`,
            })
            await supabase.from('sales_followup_queue').update({
              status: 'sent', sent_at: new Date().toISOString(),
            }).eq('id', job.id)

            // Status transitions per spec
            if (job.step === 'day5') {
              const nextDate = new Date(); nextDate.setDate(nextDate.getDate() + 9)
              await supabase.from('sales_prospects').update({
                status: 'Follow-Up' === 'Follow-Up' ? 'Contacted' : 'Contacted', // keep schema-valid
                next_follow_up: nextDate.toISOString().slice(0, 10),
                last_outreach_date: today,
              }).eq('id', p.id)
            } else {
              await supabase.from('sales_prospects').update({
                status: 'Archived', next_follow_up: null, last_outreach_date: today,
              }).eq('id', p.id)
            }
            sent++
          } catch (e: any) {
            await supabase.from('sales_followup_queue').update({
              status: 'failed', error: String(e?.message || e).slice(0, 500),
            }).eq('id', job.id)
            failed++
          }
        }

        return Response.json({ processed, sent, skipped, failed })
      },
    },
  },
})

async function sendOne(
  supabase: any,
  args: { templateName: string; recipientEmail: string; templateData: Record<string, any>; idempotencyKey: string }
) {
  const tmpl = TEMPLATES[args.templateName]
  if (!tmpl) throw new Error(`unknown template ${args.templateName}`)
  const messageId = crypto.randomUUID()
  const normalized = args.recipientEmail.toLowerCase()

  const { data: sup } = await supabase.from('suppressed_emails').select('id').eq('email', normalized).maybeSingle()
  if (sup) return

  let token: string
  const { data: existing } = await supabase.from('email_unsubscribe_tokens').select('token, used_at').eq('email', normalized).maybeSingle()
  if (existing && !existing.used_at) {
    token = existing.token
  } else if (!existing) {
    token = genToken()
    await supabase.from('email_unsubscribe_tokens').upsert({ token, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
    const { data: re } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', normalized).maybeSingle()
    token = re?.token || token
  } else {
    return
  }

  const { render } = await import('@react-email/components')
  const el = React.createElement(tmpl.component, args.templateData)
  const html = await render(el)
  const text = await render(el, { plainText: true })
  const subject = typeof tmpl.subject === 'function' ? tmpl.subject(args.templateData) : tmpl.subject

  await supabase.from('email_send_log').insert({
    message_id: messageId, template_name: args.templateName, recipient_email: args.recipientEmail, status: 'pending',
  })

  const { error } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: args.recipientEmail,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject, html, text,
      purpose: 'transactional',
      label: args.templateName,
      idempotency_key: args.idempotencyKey,
      unsubscribe_token: token,
      queued_at: new Date().toISOString(),
    },
  })
  if (error) throw new Error(error.message)
}
