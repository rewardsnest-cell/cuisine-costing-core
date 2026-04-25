import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Mail, Send, Inbox, ArrowUpRight, ShieldCheck, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Reply, Paperclip, X, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { sendLeadEmail } from '@/lib/leads/send-lead-email.functions'


// ---------- Route ----------
export const Route = createFileRoute('/admin/leads/$id')({
  component: LeadDetailPage,
  loader: async ({ params }) => {
    const [leadRes, emailsRes, auditRes, attachmentsRes] = await Promise.all([
      supabase.from('leads').select('*').eq('id', params.id).maybeSingle(),
      supabase
        .from('lead_emails')
        .select('*')
        .eq('lead_id', params.id)
        .order('received_at', { ascending: false, nullsFirst: false })
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from('lead_email_audit')
        .select('*')
        .eq('lead_id', params.id)
        .order('attempted_at', { ascending: false })
        .limit(100),
      supabase
        .from('lead_email_attachments')
        .select('*')
        .eq('lead_id', params.id)
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    return {
      lead: leadRes.data,
      emails: emailsRes.data ?? [],
      audit: auditRes.data ?? [],
      attachments: attachmentsRes.data ?? [],
    }
  },
})

function LeadDetailPage() {
  const router = useRouter()
  const { lead, emails, audit, attachments } = Route.useLoaderData()

  if (!lead) {
    return (
      <div className="container mx-auto p-6">
        <Link to="/admin/catering-contacts" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to leads
        </Link>
        <p className="mt-6">Lead not found.</p>
      </div>
    )
  }

  // Index attachments by lead_email_id for inline rendering in the thread.
  const attachmentsByEmail = new Map<string, any[]>()
  for (const a of attachments) {
    if (!a.lead_email_id) continue
    if (!attachmentsByEmail.has(a.lead_email_id)) attachmentsByEmail.set(a.lead_email_id, [])
    attachmentsByEmail.get(a.lead_email_id)!.push(a)
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div>
        <Link to="/admin/catering-contacts" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to leads
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{lead.company || lead.name || lead.email || 'Untitled lead'}</h1>
            <p className="text-muted-foreground">
              {lead.name && <span>{lead.name} · </span>}
              {lead.email && <span>{lead.email} · </span>}
              {lead.phone && <span>{lead.phone}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{lead.lead_type}</Badge>
            <Badge>{lead.status}</Badge>
            <Badge variant="secondary">{lead.priority}</Badge>
          </div>
        </div>
      </div>

      <ComposeCard lead={lead} onSent={() => router.invalidate()} />

      <EmailThreadCard emails={emails} attachmentsByEmail={attachmentsByEmail} />

      <AuditCard audit={audit} />
    </div>
  )
}

function AuditCard({ audit }: { audit: any[] }) {
  const sent = audit.filter((a) => a.status === 'sent').length
  const failed = audit.filter((a) => a.status === 'failed').length
  const lastAttempt = audit[0]?.attempted_at
    ? new Date(audit[0].attempted_at).toLocaleString()
    : '—'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Outlook send audit ({audit.length})
        </CardTitle>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> {sent} sent</span>
          <span className="inline-flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5 text-destructive" /> {failed} failed</span>
          <span>Last attempt: {lastAttempt}</span>
        </div>
      </CardHeader>
      <CardContent>
        {audit.length === 0 ? (
          <p className="text-muted-foreground text-sm">No send attempts logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {audit.map((a) => (
              <li
                key={a.id}
                className={`rounded-md border p-3 text-sm ${a.status === 'failed' ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/30'}`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {a.status === 'sent' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                  <Badge variant={a.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">
                    {a.status}
                  </Badge>
                  {a.http_status != null && (
                    <Badge variant="outline" className="text-xs">HTTP {a.http_status}</Badge>
                  )}
                  {a.source && (
                    <Badge variant="outline" className="text-xs">{a.source}</Badge>
                  )}
                  <span className="ml-auto">
                    {a.attempted_at ? new Date(a.attempted_at).toLocaleString() : ''}
                    {a.duration_ms != null && (
                      <span className="ml-2 text-muted-foreground">({a.duration_ms}ms)</span>
                    )}
                  </span>
                </div>
                <div className="mt-1 font-medium">{a.subject || '(no subject)'}</div>
                <div className="text-xs text-muted-foreground">to {a.recipient}</div>
                {a.error_message && (
                  <div className="mt-2 text-xs text-destructive whitespace-pre-wrap">{a.error_message}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ComposeCard({ lead, onSent }: { lead: any; onSent: () => void }) {
  const [to, setTo] = useState<string>(lead.email ?? '')
  const [subject, setSubject] = useState<string>('')
  const [body, setBody] = useState<string>('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!to || !subject || !body) {
      toast.error('Fill in to, subject, and body')
      return
    }
    setSending(true)
    try {
      const res = await sendLeadEmail({ data: { leadId: lead.id, to, subject, body } })
      if (res.ok) {
        toast.success('Email sent via Outlook')
        setSubject('')
        setBody('')
        onSent()
      } else {
        toast.error(res.error || 'Send failed')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" /> Compose email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Textarea
          placeholder="Write your message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
        />
        <div className="flex justify-end">
          <Button onClick={send} disabled={sending}>
            {sending ? 'Sending…' : 'Send via Outlook'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Email thread ----------
function EmailThreadCard({ emails, attachmentsByEmail }: { emails: any[]; attachmentsByEmail: Map<string, any[]> }) {
  // Sort chronologically (ascending) for thread reading order
  const sorted = [...emails].sort((a, b) => {
    const ta = new Date(a.received_at || a.sent_at || a.created_at || 0).getTime()
    const tb = new Date(b.received_at || b.sent_at || b.created_at || 0).getTime()
    return ta - tb
  })

  // Group by Outlook conversation_id; ungrouped emails get their own bucket.
  const groups = new Map<string, any[]>()
  for (const e of sorted) {
    const key = e.outlook_conversation_id || `single:${e.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }
  const threads = Array.from(groups.values()).sort((a, b) => {
    const la = new Date(a[a.length - 1].received_at || a[a.length - 1].sent_at || 0).getTime()
    const lb = new Date(b[b.length - 1].received_at || b[b.length - 1].sent_at || 0).getTime()
    return lb - la // newest thread first
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" /> Email thread ({emails.length} message{emails.length === 1 ? '' : 's'} · {threads.length} conversation{threads.length === 1 ? '' : 's'})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {threads.length === 0 ? (
          <p className="text-muted-foreground text-sm">No emails yet. Send the first one above, or wait for the inbox poller to import a reply.</p>
        ) : (
          <div className="space-y-6">
            {threads.map((thread, idx) => (
              <ThreadView key={thread[0].outlook_conversation_id || thread[0].id} thread={thread} defaultOpen={idx === 0} attachmentsByEmail={attachmentsByEmail} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ThreadView({ thread, defaultOpen, attachmentsByEmail }: { thread: any[]; defaultOpen: boolean; attachmentsByEmail: Map<string, any[]> }) {
  const subject = thread[0].subject || '(no subject)'
  const inboundCount = thread.filter((m) => m.direction === 'inbound').length
  const outboundCount = thread.filter((m) => m.direction === 'outbound').length
  const lastMsg = thread[thread.length - 1]
  const lastWasReply = lastMsg.direction === 'inbound'

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <div className="font-medium truncate">{subject}</div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {lastWasReply ? (
            <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
              <Reply className="mr-1 h-3 w-3" /> Reply received
            </Badge>
          ) : (
            <Badge variant="outline">
              <ArrowUpRight className="mr-1 h-3 w-3" /> Awaiting reply
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">{outboundCount} sent</Badge>
          <Badge variant="secondary" className="text-xs">{inboundCount} received</Badge>
        </div>
      </div>
      <div className="divide-y">
        {thread.map((m, i) => (
          <MessageItem key={m.id} message={m} defaultOpen={defaultOpen && i === thread.length - 1} attachments={attachmentsByEmail.get(m.id) ?? []} />
        ))}
      </div>
    </div>
  )
}

function MessageItem({ message: m, defaultOpen, attachments }: { message: any; defaultOpen: boolean; attachments: any[] }) {
  const [open, setOpen] = useState(defaultOpen)
  const isInbound = m.direction === 'inbound'
  const ts = m.received_at || m.sent_at
  const peopleLabel = isInbound
    ? `${m.from_name ? m.from_name + ' ' : ''}<${m.from_email}>`
    : (m.to_emails ?? []).join(', ')

  return (
    <div className={isInbound ? 'bg-primary/5' : 'bg-background'}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/40"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        {isInbound ? (
          <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
            <Inbox className="mr-1 h-3 w-3" /> Reply
          </Badge>
        ) : (
          <Badge variant="secondary">
            <ArrowUpRight className="mr-1 h-3 w-3" /> Sent
          </Badge>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">
            <span className="font-medium">{isInbound ? 'From' : 'To'}:</span>{' '}
            <span className="text-muted-foreground">{peopleLabel}</span>
          </div>
          {!open && (
            <div className="truncate text-xs text-muted-foreground">
              {m.body_preview || (m.body_text ?? '').slice(0, 160)}
            </div>
          )}
        </div>
        {attachments.length > 0 && (
          <Badge variant="outline" className="ml-2 text-xs">
            <Paperclip className="mr-1 h-3 w-3" /> {attachments.length}
          </Badge>
        )}
        <div className="ml-auto shrink-0 text-xs text-muted-foreground">
          {ts ? new Date(ts).toLocaleString() : ''}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {m.template_name && (
            <Badge variant="outline" className="text-xs">template: {m.template_name}</Badge>
          )}
          {m.body_html ? (
            <div
              className="prose prose-sm max-w-none rounded border bg-background p-3 dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: m.body_html }}
            />
          ) : (
            <pre className="whitespace-pre-wrap rounded border bg-background p-3 text-sm text-foreground/90 font-sans">
              {m.body_text || m.body_preview || '(no content)'}
            </pre>
          )}
          {attachments.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Paperclip className="h-3 w-3" /> Attachments ({attachments.length})
              </div>
              <ul className="flex flex-wrap gap-2">
                {attachments.map((a) => {
                  const { data: pub } = supabase.storage
                    .from(a.storage_bucket || 'lead-email-attachments')
                    .getPublicUrl(a.storage_path)
                  return (
                    <li key={a.id}>
                      <a
                        href={pub.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-xs hover:bg-muted"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span className="font-medium">{a.file_name}</span>
                        {a.size_bytes != null && (
                          <span className="text-muted-foreground">
                            · {formatBytes(a.size_bytes)}
                          </span>
                        )}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
