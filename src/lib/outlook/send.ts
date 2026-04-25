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

export interface OutlookAttachmentInput {
  /** File name shown in the email (e.g. "menu.pdf"). */
  name: string
  /** MIME type, e.g. "application/pdf" or "image/png". */
  contentType: string
  /** Raw bytes encoded as base64 (NOT a data URL). */
  contentBytesBase64: string
}

export interface SendOutlookEmailParams {
  to: string | string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html?: string
  text?: string
  /** When set, the sent message is saved to Sent Items (default true). */
  saveToSentItems?: boolean
  /** Optional attachments uploaded with the message (each ≤ ~3 MB inline). */
  attachments?: OutlookAttachmentInput[]
}

export interface SendOutlookEmailResult {
  ok: boolean
  /** HTTP status from the final send call. */
  status: number
  error?: string
  /** Outlook message ID (Graph entity ID), available when sent via draft flow. */
  outlookMessageId?: string
  /** Outlook conversation ID (threading key). */
  outlookConversationId?: string
  /** Standard RFC 822 Message-ID header value. */
  internetMessageId?: string
  /** Per-attachment Outlook IDs, in the same order as `attachments` input. */
  attachmentIds?: Array<{ name: string; outlookAttachmentId: string | null }>
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

  // Use the draft → send flow so we can read back the message identifiers
  // (Graph's /sendMail returns 202 with no body, losing all IDs).
  const createRes = await fetch(`${GATEWAY_URL}/me/messages`, {
    method: 'POST',
    headers: gatewayHeaders(),
    body: JSON.stringify(message),
  })

  if (!createRes.ok) {
    const errBody = await createRes.text().catch(() => '')
    return {
      ok: false,
      status: createRes.status,
      error: `Outlook create-draft failed [${createRes.status}]: ${errBody.slice(0, 500)}`,
    }
  }

  const draft = (await createRes.json().catch(() => ({}))) as {
    id?: string
    conversationId?: string
    internetMessageId?: string
  }

  const draftId = draft.id
  if (!draftId) {
    return { ok: false, status: createRes.status, error: 'Outlook did not return a draft id' }
  }

  // Attach files to the draft before sending.
  // Microsoft Graph supports file attachments up to ~3 MB inline via this endpoint;
  // for larger files an upload session would be required (out of scope here).
  const attachmentIds: Array<{ name: string; outlookAttachmentId: string | null }> = []
  if (params.attachments && params.attachments.length > 0) {
    for (const att of params.attachments) {
      const attRes = await fetch(
        `${GATEWAY_URL}/me/messages/${encodeURIComponent(draftId)}/attachments`,
        {
          method: 'POST',
          headers: gatewayHeaders(),
          body: JSON.stringify({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: att.name,
            contentType: att.contentType,
            contentBytes: att.contentBytesBase64,
          }),
        },
      )
      if (!attRes.ok) {
        const errBody = await attRes.text().catch(() => '')
        return {
          ok: false,
          status: attRes.status,
          error: `Outlook attach failed for "${att.name}" [${attRes.status}]: ${errBody.slice(0, 400)}`,
          outlookMessageId: draftId,
          outlookConversationId: draft.conversationId,
          internetMessageId: draft.internetMessageId,
          attachmentIds,
        }
      }
      const attJson = (await attRes.json().catch(() => ({}))) as { id?: string }
      attachmentIds.push({ name: att.name, outlookAttachmentId: attJson.id ?? null })
    }
  }

  const sendRes = await fetch(`${GATEWAY_URL}/me/messages/${encodeURIComponent(draftId)}/send`, {
    method: 'POST',
    headers: gatewayHeaders(),
  })

  if (sendRes.status !== 202 && !sendRes.ok) {
    const errBody = await sendRes.text().catch(() => '')
    return {
      ok: false,
      status: sendRes.status,
      error: `Outlook send-draft failed [${sendRes.status}]: ${errBody.slice(0, 500)}`,
      outlookMessageId: draftId,
      outlookConversationId: draft.conversationId,
      internetMessageId: draft.internetMessageId,
      attachmentIds,
    }
  }

  return {
    ok: true,
    status: sendRes.status,
    outlookMessageId: draftId,
    outlookConversationId: draft.conversationId,
    internetMessageId: draft.internetMessageId,
    attachmentIds,
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
