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
import { Mail, Send, Loader2, ArrowLeft, Eye, Pencil, CheckCircle2 } from "lucide-react";
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
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<"compose" | "review">("compose");

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
    setRecipient(prospect.email ?? "");
    setStep("compose");
  }, [open, prospect, isReply]);

  const onPickTemplate = (key: string) => {
    if (!prospect) return;
    const k = key as ProspectTemplateKey;
    setTemplateKey(k);
    const rendered = renderProspectTemplate(k, prospect);
    setSubject(isReply && !rendered.subject.startsWith("Re:") ? `Re: ${rendered.subject}` : rendered.subject);
    setBodyText(rendered.text);
  };

  // Build the HTML payload from the (possibly-edited) plain text body.
  const builtHtml = useMemo(() => {
    if (!prospect) return "";
    const rendered = renderProspectTemplate(templateKey, prospect);
    return rendered.html.replace(/<p[^>]*>[\s\S]*<\/p>/, "")
      + bodyText
          .split(/\n{2,}/)
          .map((p) =>
            `<p style="margin:0 0 14px;line-height:1.55;color:#222;font-size:15px;">${
              p.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br/>")
            }</p>`,
          )
          .join("");
  }, [prospect, templateKey, bodyText]);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const goToReview = () => {
    if (!prospect) return;
    if (!isValidEmail(recipient)) { toast.error("Enter a valid recipient email"); return; }
    if (!subject.trim() || !bodyText.trim()) { toast.error("Subject and body are required"); return; }
    setStep("review");
  };

  const send = async () => {
    if (!prospect) return;
    if (!isValidEmail(recipient)) { toast.error("Enter a valid recipient email"); return; }
    if (!subject.trim() || !bodyText.trim()) { toast.error("Subject and body are required"); return; }
    setSending(true);
    try {
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
          html: builtHtml,
          text: bodyText,
          isReply: !!isReply,
          recipientEmail: recipient.trim(),
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

  const templateLabel =
    PROSPECT_TEMPLATE_LIST.find((t) => t.key === templateKey)?.label ?? templateKey;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            {isReply ? "Reply to" : "Email"} {prospect?.business_name}
            {step === "review" && (
              <Badge variant="secondary" className="ml-1 gap-1">
                <Eye className="w-3 h-3" /> Review
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        {prospect && step === "compose" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{prospect.type ?? "—"}</Badge>
              {prospect.contact_name && <span>{prospect.contact_name}</span>}
              {prospect.city && <span>· {prospect.city}</span>}
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
              <Label className="text-xs">To</Label>
              <Input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="name@example.com"
              />
            </div>

            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div>
              <Label className="text-xs">Body (edit before sending)</Label>
              <Textarea
                rows={12}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>
        )}

        {prospect && step === "review" && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0 text-xs uppercase tracking-wide pt-0.5">To</span>
                <span className="font-medium break-all">{recipient}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0 text-xs uppercase tracking-wide pt-0.5">Prospect</span>
                <span>{prospect.business_name}{prospect.contact_name ? ` · ${prospect.contact_name}` : ""}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0 text-xs uppercase tracking-wide pt-0.5">Template</span>
                <span>{templateLabel}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0 text-xs uppercase tracking-wide pt-0.5">Subject</span>
                <span className="font-medium">{subject}</span>
              </div>
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1">
                <Eye className="w-3 h-3" /> Email preview
              </Label>
              <div
                className="mt-1 max-h-[340px] overflow-auto rounded-md border bg-white p-4 text-[14px] leading-relaxed text-foreground"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: builtHtml }}
              />
            </div>

            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Confirm the recipient and content above. Clicking <strong>Send</strong> will deliver this email immediately.</span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === "compose" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={goToReview} disabled={!recipient || !subject || !bodyText} className="gap-1.5">
                <Eye className="w-4 h-4" /> Review & confirm
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("compose")} disabled={sending} className="gap-1.5">
                <ArrowLeft className="w-4 h-4" /> Back to edit
              </Button>
              <Button onClick={send} disabled={sending} className="gap-1.5">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Sending…" : isReply ? "Confirm & send reply" : "Confirm & send"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
