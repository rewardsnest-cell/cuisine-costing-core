/**
 * Outlook send helper — calls the Microsoft Graph API via the Lovable connector gateway.
 * Used by the follow-up cron and manual lead compose.
 *
 * Auth: Bearer LOVABLE_API_KEY + X-Connection-Api-Key: MICROSOFT_OUTLOOK_API_KEY
 *
 * Sends from the connected Outlook mailbox (the developer/admin account that
 * completed the OAuth flow when setting up the connection).
 */

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/microsoft_outlook'

export interface SendOutlookEmailParams {
  to: string | string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html?: string
  text?: string
  /** When set, the sent message is saved to Sent Items (default true). */
  saveToSentItems?: boolean
}

export interface SendOutlookEmailResult {
  ok: boolean
  /** Best-effort: Outlook does not return the message ID from sendMail. */
  status: number
  error?: string
}

function getAuth(): { lovableKey: string; outlookKey: string } {
  const lovableKey = process.env.LOVABLE_API_KEY
  if (!lovableKey) throw new Error('LOVABLE_API_KEY is not configured')
  const outlookKey = process.env.MICROSOFT_OUTLOOK_API_KEY
  if (!outlookKey) throw new Error('MICROSOFT_OUTLOOK_API_KEY is not configured')
  return { lovableKey, outlookKey }
}

function gatewayHeaders(): Record<string, string> {
  const { lovableKey, outlookKey } = getAuth()
  return {
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': outlookKey,
    'Content-Type': 'application/json',
  }
}

function recipientList(values: string | string[] | undefined): Array<{ emailAddress: { address: string } }> {
  if (!values) return []
  const arr = Array.isArray(values) ? values : [values]
  return arr
    .map((v) => v.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }))
}

export async function sendOutlookEmail(params: SendOutlookEmailParams): Promise<SendOutlookEmailResult> {
  const toRecipients = recipientList(params.to)
  if (toRecipients.length === 0) {
    return { ok: false, status: 400, error: 'At least one recipient is required' }
  }

  // Outlook prefers HTML when both are provided; fall back to plain text.
  const isHtml = !!params.html
  const content = params.html || params.text || ''

  const message = {
    subject: params.subject,
    body: {
      contentType: isHtml ? 'HTML' : 'Text',
      content,
    },
    toRecipients,
    ccRecipients: recipientList(params.cc),
    bccRecipients: recipientList(params.bcc),
  }

  const response = await fetch(`${GATEWAY_URL}/me/sendMail`, {
    method: 'POST',
    headers: gatewayHeaders(),
    body: JSON.stringify({
      message,
      saveToSentItems: params.saveToSentItems !== false,
    }),
  })

  // sendMail returns 202 Accepted with no body on success.
  if (response.status === 202 || response.ok) {
    return { ok: true, status: response.status }
  }

  const errBody = await response.text().catch(() => '')
  return {
    ok: false,
    status: response.status,
    error: `Outlook sendMail failed [${response.status}]: ${errBody.slice(0, 500)}`,
  }
}

export interface ListInboxParams {
  /** ISO date string — only fetch messages received after this time. */
  since?: string
  /** Max messages to return (default 50, Graph max 1000). */
  top?: number
}

export interface OutlookMessage {
  id: string
  conversationId: string
  internetMessageId: string
  subject: string | null
  bodyPreview: string
  body: { contentType: 'html' | 'text'; content: string }
  from: { emailAddress: { name?: string; address: string } } | null
  toRecipients: Array<{ emailAddress: { name?: string; address: string } }>
  ccRecipients: Array<{ emailAddress: { name?: string; address: string } }>
  receivedDateTime: string
  isRead: boolean
  inReplyTo?: string
}

export async function listInboxMessages(params: ListInboxParams = {}): Promise<OutlookMessage[]> {
  const top = Math.min(params.top ?? 50, 200)
  const select = [
    'id',
    'conversationId',
    'internetMessageId',
    'subject',
    'bodyPreview',
    'body',
    'from',
    'toRecipients',
    'ccRecipients',
    'receivedDateTime',
    'isRead',
  ].join(',')

  const search = new URLSearchParams()
  search.set('$top', String(top))
  search.set('$orderby', 'receivedDateTime desc')
  search.set('$select', select)
  if (params.since) {
    search.set('$filter', `receivedDateTime gt ${params.since}`)
  }

  const url = `${GATEWAY_URL}/me/mailFolders/inbox/messages?${search.toString()}`
  const response = await fetch(url, {
    method: 'GET',
    headers: gatewayHeaders(),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(`Outlook list inbox failed [${response.status}]: ${errBody.slice(0, 500)}`)
  }

  const data = (await response.json()) as { value?: OutlookMessage[] }
  return data.value ?? []
}
