import { createServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { TEMPLATES } from '@/lib/email-templates/registry'

export interface PersonalizationIssue {
  level: 'error' | 'warning' | 'info'
  field: string
  message: string
}

export interface PreviewResult {
  ok: boolean
  templateName: string
  subject: string
  html: string
  text: string
  issues: PersonalizationIssue[]
  resolvedData: { contactName?: string; businessName?: string }
}

const DAY_TEMPLATES = new Set([
  'prospect-followup-day0',
  'prospect-followup-day5',
  'prospect-followup-day14',
])

/**
 * Validate and render a Day 0 / 5 / 14 outreach email against sample contact
 * data. Returns rendered HTML + plain text + a list of personalization
 * issues (missing names, generic fallbacks, leftover {{placeholders}}, etc.).
 *
 * This is the same pipeline used by the cron sender, so what you preview is
 * exactly what the recipient would receive.
 */
export const previewOutreachTemplate = createServerFn({ method: 'POST' })
  .inputValidator((d: {
    templateName: string
    contactName?: string | null
    businessName?: string | null
    email?: string | null
  }) => d)
  .handler(async ({ data }): Promise<PreviewResult> => {
    const issues: PersonalizationIssue[] = []

    if (!DAY_TEMPLATES.has(data.templateName)) {
      throw new Error(`Template ${data.templateName} is not a Day 0/5/14 outreach template`)
    }
    const tmpl = TEMPLATES[data.templateName]
    if (!tmpl) throw new Error(`Template ${data.templateName} not registered`)

    const contactName = data.contactName?.trim() || undefined
    const businessName = data.businessName?.trim() || undefined
    const email = data.email?.trim() || undefined

    // ---- Personalization checks ----
    if (!contactName) {
      issues.push({
        level: 'warning',
        field: 'contactName',
        message: 'No contact name — greeting will fall back to business name or generic "Hi,".',
      })
    } else if (contactName.length < 2) {
      issues.push({ level: 'warning', field: 'contactName', message: 'Contact name looks unusually short.' })
    } else if (/[@<>]/.test(contactName)) {
      issues.push({ level: 'error', field: 'contactName', message: 'Contact name contains email/HTML characters — likely a bad import.' })
    } else if (contactName === contactName.toUpperCase() && contactName.length > 3) {
      issues.push({ level: 'info', field: 'contactName', message: 'Contact name is ALL CAPS — consider title-casing.' })
    }

    if (!businessName) {
      issues.push({
        level: 'error',
        field: 'businessName',
        message: 'No business name — fallback greeting will be generic "Hi,".',
      })
    } else if (/[<>{}]/.test(businessName)) {
      issues.push({ level: 'error', field: 'businessName', message: 'Business name contains template/HTML characters.' })
    }

    if (!email) {
      issues.push({ level: 'error', field: 'email', message: 'No email address — this contact cannot be sent to.' })
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({ level: 'error', field: 'email', message: 'Email format looks invalid.' })
    }

    // ---- Render template ----
    const { render } = await import('@react-email/components')
    const props = { contactName, businessName }
    const element = React.createElement(tmpl.component, props)
    const html = await render(element)
    const text = await render(element, { plainText: true })
    const subject = typeof tmpl.subject === 'function' ? tmpl.subject(props) : tmpl.subject

    // ---- Post-render checks (catch unresolved placeholders / personalization gaps) ----
    const placeholderMatch = text.match(/\{\{[^}]+\}\}|\$\{[^}]+\}/)
    if (placeholderMatch) {
      issues.push({
        level: 'error',
        field: 'rendered',
        message: `Unresolved placeholder in rendered email: "${placeholderMatch[0]}".`,
      })
    }
    if (text.includes('undefined') || text.includes('null')) {
      issues.push({
        level: 'warning',
        field: 'rendered',
        message: 'Rendered email contains the literal text "undefined" or "null" — a prop is likely missing.',
      })
    }
    if (!contactName && !businessName) {
      issues.push({
        level: 'warning',
        field: 'rendered',
        message: 'Greeting will be the fully-generic "Hi," with no name at all.',
      })
    }

    const hasErrors = issues.some((i) => i.level === 'error')
    return {
      ok: !hasErrors,
      templateName: data.templateName,
      subject,
      html,
      text,
      issues,
      resolvedData: { contactName, businessName },
    }
  })
