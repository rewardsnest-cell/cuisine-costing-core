import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Mail, Send } from 'lucide-react'
import { toast } from 'sonner'
import { sendLeadEmail } from '@/lib/leads/send-lead-email.functions'

export interface LeadEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: {
    id: string
    company?: string | null
    name?: string | null
    email?: string | null
  } | null
  onSent?: () => void
}

export function LeadEmailDialog({ open, onOpenChange, lead, onSent }: LeadEmailDialogProps) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open || !lead) return
    setTo(lead.email ?? '')
    setSubject('')
    const greeting = lead.name ? `Hi ${lead.name.split(' ')[0]},` : 'Hello,'
    setBody(`${greeting}\n\n\n\nBest,\nVPs Finest`)
  }, [open, lead])

  const send = async () => {
    if (!lead) return
    if (!to || !subject.trim() || !body.trim()) {
      toast.error('To, subject and body are all required')
      return
    }
    setSending(true)
    try {
      const res = await sendLeadEmail({
        data: { leadId: lead.id, to, subject, body },
      })
      if (res.ok) {
        toast.success('Email sent via Outlook')
        onOpenChange(false)
        onSent?.()
      } else {
        toast.error(res.error || 'Send failed')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const title = lead?.company || lead?.name || lead?.email || 'lead'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Compose from Outlook — {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">To</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@example.com" />
          </div>
          <div>
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sends from your connected Outlook mailbox and logs to the lead's email
            thread and activity timeline.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending || !to} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send via Outlook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
