import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Mail, Send, Inbox, ArrowUpRight, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { sendLeadEmail } from '@/lib/leads/send-lead-email.functions'


// ---------- Route ----------
export const Route = createFileRoute('/admin/leads/$id')({
  component: LeadDetailPage,
  loader: async ({ params }) => {
    const [leadRes, emailsRes, auditRes] = await Promise.all([
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
    ])
    return {
      lead: leadRes.data,
      emails: emailsRes.data ?? [],
      audit: auditRes.data ?? [],
    }
  },
})

function LeadDetailPage() {
  const router = useRouter()
  const { lead, emails } = Route.useLoaderData()

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Email thread ({emails.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <p className="text-muted-foreground text-sm">No emails yet. Send the first one above, or wait for the inbox poller to import a reply.</p>
          ) : (
            <ul className="space-y-3">
              {emails.map((e: any) => (
                <li
                  key={e.id}
                  className={`rounded-lg border p-4 ${e.direction === 'inbound' ? 'border-primary/40 bg-primary/5' : 'bg-muted/40'}`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {e.direction === 'inbound' ? (
                      <Inbox className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    )}
                    <span className="font-medium">
                      {e.direction === 'inbound' ? 'From' : 'To'}:
                    </span>
                    <span>
                      {e.direction === 'inbound'
                        ? `${e.from_name ?? ''} <${e.from_email}>`
                        : (e.to_emails ?? []).join(', ')}
                    </span>
                    <span className="ml-auto">
                      {(e.received_at || e.sent_at)
                        ? new Date(e.received_at || e.sent_at).toLocaleString()
                        : ''}
                    </span>
                  </div>
                  <div className="mt-1 font-medium">{e.subject || '(no subject)'}</div>
                  <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
                    {e.body_preview || (e.body_text ?? '').slice(0, 400)}
                  </p>
                  {e.template_name && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      template: {e.template_name}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
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
