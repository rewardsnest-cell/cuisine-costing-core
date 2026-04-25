import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Send, Loader2 } from "lucide-react";
import {
  PROSPECT_TEMPLATE_LIST,
  defaultTemplateForType,
  getRecommendedTemplates,
  renderProspectTemplate,
  type ProspectTemplateKey,
} from "@/lib/sales-hub/prospect-templates";

export interface ProspectEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: {
    id: string;
    business_name: string;
    contact_name: string | null;
    city: string | null;
    type: string | null;
    email: string | null;
  } | null;
  /** When true, the dialog is opened to reply to a prospect's inbound email. */
  isReply?: boolean;
  onSent?: () => void;
}

export function ProspectEmailDialog({
  open, onOpenChange, prospect, isReply, onSent,
}: ProspectEmailDialogProps) {
  const recommended = useMemo(
    () => (prospect ? getRecommendedTemplates(prospect.type) : PROSPECT_TEMPLATE_LIST),
    [prospect],
  );
  const [templateKey, setTemplateKey] = useState<ProspectTemplateKey>("generic_followup");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);

  // Reset & populate when dialog opens
  useEffect(() => {
    if (!open || !prospect) return;
    const initialKey = isReply
      ? "generic_followup"
      : defaultTemplateForType(prospect.type);
    setTemplateKey(initialKey);
    const rendered = renderProspectTemplate(initialKey, prospect);
    setSubject(isReply && !rendered.subject.startsWith("Re:") ? `Re: ${rendered.subject}` : rendered.subject);
    setBodyText(rendered.text);
  }, [open, prospect, isReply]);

  const onPickTemplate = (key: string) => {
    if (!prospect) return;
    const k = key as ProspectTemplateKey;
    setTemplateKey(k);
    const rendered = renderProspectTemplate(k, prospect);
    setSubject(isReply && !rendered.subject.startsWith("Re:") ? `Re: ${rendered.subject}` : rendered.subject);
    setBodyText(rendered.text);
  };

  const send = async () => {
    if (!prospect) return;
    if (!prospect.email) { toast.error("Prospect has no email"); return; }
    if (!subject.trim() || !bodyText.trim()) { toast.error("Subject and body are required"); return; }
    setSending(true);
    try {
      const rendered = renderProspectTemplate(templateKey, prospect);
      // Re-wrap the (possibly-edited) text into HTML by replacing the body of the rendered html.
      const html = rendered.html.replace(/<p[^>]*>[\s\S]*<\/p>/, "")
        + bodyText
            .split(/\n{2,}/)
            .map((p) =>
              `<p style="margin:0 0 14px;line-height:1.55;color:#222;font-size:15px;">${
                p.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br/>")
              }</p>`,
            )
            .join("");

      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess?.session?.access_token;
      if (!jwt) throw new Error("Not signed in");

      const res = await fetch("/api/public/hooks/send-prospect-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          prospectId: prospect.id,
          templateKey,
          subject,
          html,
          text: bodyText,
          isReply: !!isReply,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      toast.success(isReply ? "Reply sent" : "Email sent");
      onOpenChange(false);
      onSent?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            {isReply ? "Reply to" : "Email"} {prospect?.business_name}
          </DialogTitle>
        </DialogHeader>
        {prospect && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{prospect.type ?? "—"}</Badge>
              <span>To: {prospect.email ?? "no email"}</span>
              {prospect.contact_name && <span>· {prospect.contact_name}</span>}
            </div>

            <div>
              <Label className="text-xs">Template</Label>
              <Select value={templateKey} onValueChange={onPickTemplate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    Recommended for {prospect.type ?? "this prospect"}
                  </div>
                  {recommended.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label} — <span className="text-muted-foreground text-xs">{t.description}</span>
                    </SelectItem>
                  ))}
                  {recommended.length < PROSPECT_TEMPLATE_LIST.length && (
                    <>
                      <div className="px-2 py-1 mt-1 text-[10px] font-semibold uppercase text-muted-foreground border-t">
                        Other templates
                      </div>
                      {PROSPECT_TEMPLATE_LIST
                        .filter((t) => !recommended.some((r) => r.key === t.key))
                        .map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.label}
                          </SelectItem>
                        ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div>
              <Label className="text-xs">Body (edit before sending)</Label>
              <Textarea
                rows={14}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending || !prospect?.email} className="gap-1.5">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Sending…" : isReply ? "Send reply" : "Send email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
