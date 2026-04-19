import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import * as React from 'react'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE = 'https://www.vpsfinest.com'
const SITE_NAME = 'VPS Finest'
const SENDER_DOMAIN = 'notify.vpfinest.com'
const FROM_DOMAIN = 'notify.vpfinest.com'

const VALID_MAGNETS = ['printable', 'scaling', 'checklist', 'pack'] as const

function isEmail(s: unknown): s is string {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254
}
function genToken() {
  const b = new Uint8Array(32); crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

export const Route = createFileRoute('/api/recipe-signup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = import.meta.env.VITE_SUPABASE_URL!
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return Response.json({ error: 'Server misconfigured' }, { status: 500 })
        const supabase = createClient(url, serviceKey)

        let body: any
        try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

        const email = String(body.email || '').trim().toLowerCase()
        const recipeId = body.recipeId ? String(body.recipeId) : null
        const leadMagnet = VALID_MAGNETS.includes(body.leadMagnet) ? body.leadMagnet : 'printable'

        if (!isEmail(email)) return Response.json({ error: 'Invalid email' }, { status: 400 })
        if (recipeId && !/^[0-9a-f-]{36}$/i.test(recipeId)) return Response.json({ error: 'Invalid recipeId' }, { status: 400 })

        // Suppression check
        const { data: suppressed } = await supabase
          .from('suppressed_emails').select('id').eq('email', email).maybeSingle()
        if (suppressed) {
          return Response.json({ success: true, suppressed: true })
        }

        // Recipe lookup (for personalization + printable URL)
        let recipe: { id: string; name: string } | null = null
        if (recipeId) {
          const { data } = await supabase.from('recipes').select('id, name').eq('id', recipeId).eq('active', true).maybeSingle()
          if (data) recipe = data
        }

        // Insert signup
        const { data: signup, error: insErr } = await supabase
          .from('recipe_email_signups')
          .insert({
            email,
            recipe_id: recipe?.id || null,
            lead_magnet: leadMagnet,
            source: 'recipe_page',
            user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
          })
          .select('id').single()
        if (insErr || !signup) {
          console.error('signup insert failed', insErr)
          return Response.json({ error: 'Could not save signup' }, { status: 500 })
        }

        // Mirror into newsletter_subscribers for general broadcasts
        await supabase.from('newsletter_subscribers')
          .insert({ email, source: 'recipe_lead_magnet' })
          .select().then(() => {}, () => {})

        // Schedule drip jobs (Day 0/2/4/7). Day 0 = immediate.
        const now = Date.now()
        const day = 86400000
        const jobs = [
          { step: 1, template: 'recipe-welcome',  send_after: new Date(now) },
          { step: 2, template: 'recipe-related',  send_after: new Date(now + 2 * day) },
          { step: 3, template: 'recipe-tools',    send_after: new Date(now + 4 * day) },
          { step: 4, template: 'recipe-catering', send_after: new Date(now + 7 * day) },
        ]
        await supabase.from('recipe_drip_jobs').insert(
          jobs.map((j) => ({
            signup_id: signup.id,
            email,
            recipe_id: recipe?.id || null,
            step: j.step,
            template_name: j.template,
            send_after: j.send_after.toISOString(),
          }))
        )

        // Send Email 1 immediately (inline) — same enqueue path the send route uses.
        try {
          const printableUrl = recipe ? `${SITE}/api/recipes/${recipe.id}/printable` : `${SITE}/recipes`
          const recipeUrl = recipe ? `${SITE}/recipes/${recipe.id}` : `${SITE}/recipes`
          await sendNow(supabase, {
            templateName: 'recipe-welcome',
            recipientEmail: email,
            templateData: {
              recipeName: recipe?.name,
              recipeUrl,
              printableUrl,
              leadMagnet,
            },
            idempotencyKey: `recipe-welcome-${signup.id}`,
          })
          // Mark step 1 as sent so the cron skips it
          await supabase.from('recipe_drip_jobs')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('signup_id', signup.id).eq('step', 1)
        } catch (e: any) {
          console.error('immediate welcome send failed', e?.message || e)
        }

        return Response.json({
          success: true,
          printableUrl: recipe ? `${SITE}/api/recipes/${recipe.id}/printable` : null,
        })
      },
    },
  },
})

async function sendNow(
  supabase: ReturnType<typeof createClient>,
  args: { templateName: string; recipientEmail: string; templateData: Record<string, any>; idempotencyKey: string }
) {
  const tmpl = TEMPLATES[args.templateName]
  if (!tmpl) throw new Error(`unknown template ${args.templateName}`)
  const messageId = crypto.randomUUID()

  // unsubscribe token (one per email)
  const normalized = args.recipientEmail.toLowerCase()
  let token: string
  const { data: existing } = await supabase.from('email_unsubscribe_tokens')
    .select('token, used_at').eq('email', normalized).maybeSingle()
  if (existing && !existing.used_at) {
    token = existing.token
  } else if (!existing) {
    token = genToken()
    await supabase.from('email_unsubscribe_tokens')
      .upsert({ token, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
    const { data: re } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', normalized).maybeSingle()
    token = re?.token || token
  } else {
    // already used = recipient is suppressed; bail silently
    await supabase.from('email_send_log').insert({
      message_id: messageId, template_name: args.templateName, recipient_email: args.recipientEmail, status: 'suppressed',
    })
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
  if (error) {
    await supabase.from('email_send_log').insert({
      message_id: messageId, template_name: args.templateName, recipient_email: args.recipientEmail,
      status: 'failed', error_message: error.message,
    })
    throw new Error(error.message)
  }
}
