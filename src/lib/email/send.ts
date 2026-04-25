import { supabase } from '@/integrations/supabase/client'

export interface SendTransactionalEmailParams {
  templateName: string
  recipientEmail: string
  idempotencyKey?: string
  templateData?: Record<string, any>
}

export interface SendTransactionalEmailResult {
  ok: boolean
  status: number
  messageId?: string
  error?: string
  body?: any
}

/**
 * Send a transactional email through Lovable's queue-based email infrastructure.
 * Authenticates with the current Supabase session JWT.
 */
export async function sendTransactionalEmail(
  params: SendTransactionalEmailParams,
): Promise<SendTransactionalEmailResult> {
  const { data: { session } } = await supabase.auth.getSession()

  try {
    const response = await fetch('/lovable/email/transactional/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({
        templateName: params.templateName,
        recipientEmail: params.recipientEmail,
        idempotencyKey: params.idempotencyKey,
        templateData: params.templateData ?? {},
      }),
    })

    let body: any = null
    try {
      body = await response.json()
    } catch {
      // non-JSON response is fine
    }

    return {
      ok: response.ok,
      status: response.status,
      messageId: body?.messageId ?? params.idempotencyKey,
      error: response.ok ? undefined : (body?.error || response.statusText),
      body,
    }
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      error: err?.message ?? 'Network error',
    }
  }
}
