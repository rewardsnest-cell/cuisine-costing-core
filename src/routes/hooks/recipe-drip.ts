import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import * as React from 'react'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE = 'https://www.vpsfinest.com'
const SITE_NAME = 'VPS Finest'
const SENDER_DOMAIN = 'notify.vpfinest.com'
const FROM_DOMAIN = 'notify.vpfinest.com'

function genToken() {
  const b = new Uint8Array(32); crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

export const Route = createFileRoute('/hooks/recipe-drip')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get('authorization')
        if (!auth?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 })

        const url = import.meta.env.VITE_SUPABASE_URL!
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return Response.json({ error: 'misconfigured' }, { status: 500 })
        const supabase = createClient(url, serviceKey)

        // Pull due jobs (cap to 50 per cycle)
        const { data: jobs, error } = await supabase
          .from('recipe_drip_jobs')
          .select('id, signup_id, email, recipe_id, step, template_name, attempts')
          .eq('status', 'pending')
          .lte('send_after', new Date().toISOString())
          .order('send_after', { ascending: true })
          .limit(50)
        if (error) return Response.json({ error: error.message }, { status: 500 })

        let processed = 0, sent = 0, failed = 0, suppressed = 0

        for (const job of jobs || []) {
          processed++
          const email = job.email.toLowerCase()

          // Suppression
          const { data: sup } = await supabase.from('suppressed_emails').select('id').eq('email', email).maybeSingle()
          if (sup) {
            await supabase.from('recipe_drip_jobs').update({ status: 'skipped', sent_at: new Date().toISOString() }).eq('id', job.id)
            suppressed++; continue
          }

          // Resolve template data per step
          let templateData: Record<string, any> = {}
          let recipe: { id: string; name: string; hook: string | null; category: string | null } | null = null
          if (job.recipe_id) {
            const { data } = await supabase.from('recipes')
              .select('id, name, hook, category').eq('id', job.recipe_id).maybeSingle()
            if (data) recipe = data
          }

          if (job.template_name === 'recipe-welcome') {
            templateData = {
              recipeName: recipe?.name,
              recipeUrl: recipe ? `${SITE}/recipes/${recipe.id}` : `${SITE}/recipes`,
              printableUrl: recipe ? `${SITE}/api/recipes/${recipe.id}/printable` : `${SITE}/recipes`,
              leadMagnet: 'printable',
            }
          } else if (job.template_name === 'recipe-related') {
            // 3 related recipes (same category if possible, else random active)
            let related: any[] = []
            if (recipe?.category) {
              const { data } = await supabase.from('recipes')
                .select('id, name, hook').eq('active', true).eq('category', recipe.category).neq('id', recipe.id).limit(3)
              related = data || []
            }
            if (related.length < 3) {
              const { data } = await supabase.from('recipes')
                .select('id, name, hook').eq('active', true)
                .neq('id', recipe?.id || '00000000-0000-0000-0000-000000000000')
                .order('updated_at', { ascending: false }).limit(3 - related.length)
              related = related.concat(data || [])
            }
            templateData = {
              related: related.map((r) => ({
                name: r.name,
                url: `${SITE}/recipes/${r.id}`,
                hook: r.hook || undefined,
              })),
            }
          } else if (job.template_name === 'recipe-tools') {
            let tools: any[] = []
            if (recipe?.id) {
              const { data } = await supabase.from('recipe_shop_items')
                .select('name, benefit, url').eq('recipe_id', recipe.id).limit(4)
              tools = (data || []).filter((t) => t.url)
            }
            templateData = { recipeName: recipe?.name, tools }
          }
          // recipe-catering: no data needed

          try {
            await sendOne(supabase, {
              templateName: job.template_name,
              recipientEmail: job.email,
              templateData,
              idempotencyKey: `recipe-drip-${job.signup_id}-${job.step}`,
            })
            await supabase.from('recipe_drip_jobs')
              .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: (job.attempts || 0) + 1 })
              .eq('id', job.id)
            sent++
          } catch (e: any) {
            const attempts = (job.attempts || 0) + 1
            await supabase.from('recipe_drip_jobs')
              .update({
                status: attempts >= 3 ? 'failed' : 'pending',
                attempts,
                last_error: String(e?.message || e).slice(0, 500),
                send_after: attempts < 3 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : undefined,
              })
              .eq('id', job.id)
            failed++
          }
        }

        return Response.json({ processed, sent, failed, suppressed })
      },
    },
  },
})

async function sendOne(
  supabase: ReturnType<typeof createClient>,
  args: { templateName: string; recipientEmail: string; templateData: Record<string, any>; idempotencyKey: string }
) {
  const tmpl = TEMPLATES[args.templateName]
  if (!tmpl) throw new Error(`unknown template ${args.templateName}`)
  const messageId = crypto.randomUUID()
  const normalized = args.recipientEmail.toLowerCase()

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
  if (error) throw new Error(error.message)
}
