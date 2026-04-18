import { createFileRoute } from "@tanstack/react-router"
import { createClient } from "@supabase/supabase-js"
import { render } from "@react-email/components"
import * as React from "react"
import { z } from "zod"
import { TEMPLATES } from "@/lib/email-templates/registry"

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(1).max(2000),
})

const SITE_NAME = "VPS Finest"
const SENDER_DOMAIN = "notify.vpfinest.com"
const FROM_DOMAIN = "notify.vpfinest.com"

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export const Route = createFileRoute("/api/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !supabaseServiceKey) {
          return Response.json({ error: "Server configuration error" }, { status: 500 })
        }

        let parsed
        try {
          const body = await request.json()
          parsed = contactSchema.parse(body)
        } catch (err) {
          return Response.json({ error: "Invalid input" }, { status: 400 })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const template = TEMPLATES["contact-form-notification"]
        if (!template) {
          return Response.json({ error: "Template not configured" }, { status: 500 })
        }

        const recipient = template.to || "hello@vpsfinest.com"
        const messageId = crypto.randomUUID()

        // Suppression check
        const { data: suppressed } = await supabase
          .from("suppressed_emails")
          .select("id")
          .eq("email", recipient.toLowerCase())
          .maybeSingle()
        if (suppressed) {
          return Response.json({ success: true })
        }

        // Unsubscribe token (one per email)
        const normalized = recipient.toLowerCase()
        let unsubscribeToken: string
        const { data: existing } = await supabase
          .from("email_unsubscribe_tokens")
          .select("token, used_at")
          .eq("email", normalized)
          .maybeSingle()
        if (existing && !existing.used_at) {
          unsubscribeToken = existing.token
        } else {
          unsubscribeToken = generateToken()
          await supabase
            .from("email_unsubscribe_tokens")
            .upsert({ token: unsubscribeToken, email: normalized }, { onConflict: "email", ignoreDuplicates: true })
          const { data: stored } = await supabase
            .from("email_unsubscribe_tokens")
            .select("token")
            .eq("email", normalized)
            .maybeSingle()
          if (stored) unsubscribeToken = stored.token
        }

        const element = React.createElement(template.component, parsed)
        const html = await render(element)
        const plainText = await render(element, { plainText: true })
        const subject = typeof template.subject === "function" ? template.subject(parsed) : template.subject

        await supabase.from("email_send_log").insert({
          message_id: messageId,
          template_name: "contact-form-notification",
          recipient_email: recipient,
          status: "pending",
        })

        const { error: enqueueError } = await supabase.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to: recipient,
            reply_to: parsed.email,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject,
            html,
            text: plainText,
            purpose: 'transactional',
            label: "contact-form-notification",
            idempotency_key: messageId,
            unsubscribe_token: unsubscribeToken,
            queued_at: new Date().toISOString(),
          },
        })

        if (enqueueError) {
          await supabase.from("email_send_log").insert({
            message_id: messageId,
            template_name: "contact-form-notification",
            recipient_email: recipient,
            status: "failed",
            error_message: "Failed to enqueue",
          })
          return Response.json({ error: "Failed to send" }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
