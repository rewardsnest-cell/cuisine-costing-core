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
import { Mail, Send, Loader2, Sparkles, ArrowLeft, CheckCircle2, Pencil } from "lucide-react";
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

type Step = "generate" | "review";

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) =>
      `<p style="margin:0 0 14px;line-height:1.55;color:#222;font-size:15px;">${
        p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")
      }</p>`,
    )
    .join("");
}

export function ProspectEmailDialog({
  open, onOpenChange, prospect, isReply, onSent,
}: ProspectEmailDialogProps) {
  const recommended = useMemo(
    () => (prospect ? getRecommendedTemplates(prospect.type) : PROSPECT_TEMPLATE_LIST),
    [prospect],
  );

  const [step, setStep] = useState<Step>("generate");
  const [templateKey, setTemplateKey] = useState<ProspectTemplateKey>("generic_followup");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [generated, setGenerated] = useState(false);
  const [sending, setSending] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (!open || !prospect) return;
    const initialKey = isReply ? "generic_followup" : defaultTemplateForType(prospect.type);
    setTemplateKey(initialKey);
    setRecipient(prospect.email ?? "");
    setSubject("");
    setBodyText("");
    setGenerated(false);
    setStep("generate");
  }, [open, prospect, isReply]);

  const handleGenerate = () => {
    if (!prospect) return;
    const rendered = renderProspectTemplate(templateKey, prospect);
    const subj = isReply && !rendered.subject.startsWith("Re:")
      ? `Re: ${rendered.subject}`
      : rendered.subject;
    setSubject(subj);
    setBodyText(rendered.text);
    setGenerated(true);
    setStep("review");
  };

  const previewHtml = useMemo(() => textToHtml(bodyText), [bodyText]);

  const send = async () => {
    if (!prospect) return;
    const toEmail = recipient.trim();
    if (!toEmail) { toast.error("Recipient email is required"); return; }
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
          html: previewHtml,
          text: bodyText,
          recipientEmail: toEmail,
          isReply: !!isReply,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      toast.success(isReply ? "Reply sent & saved" : "Email sent & saved to prospect history");
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            {isReply ? "Reply to" : "Email"} {prospect?.business_name}
            {step === "review" && (
              <Badge variant="secondary" className="ml-2 gap-1">
                <CheckCircle2 className="w-3 h-3" /> Review & approve
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {prospect && step === "generate" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{prospect.type ?? "—"}</Badge>
              {prospect.contact_name && <span>{prospect.contact_name}</span>}
              {prospect.city && <span>· {prospect.city}</span>}
            </div>

            <div>
              <Label className="text-xs">Template</Label>
              <Select value={templateKey} onValueChange={(v) => setTemplateKey(v as ProspectTemplateKey)}>
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
                          <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                        ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Recipient</Label>
              <Input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="contact@business.com"
              />
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Click <span className="font-medium text-foreground">Generate email</span> to draft a personalized message using this template. You'll be able to review and edit it before sending.
            </div>
          </div>
        )}

        {prospect && step === "review" && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
              <div><span className="text-muted-foreground">To:</span> <span className="font-medium">{recipient}</span></div>
              <div><span className="text-muted-foreground">Template:</span> {PROSPECT_TEMPLATE_LIST.find(t => t.key === templateKey)?.label}</div>
            </div>

            {/* Editable fields */}
            <div>
              <Label className="text-xs flex items-center gap-1"><Pencil className="w-3 h-3" /> Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1"><Pencil className="w-3 h-3" /> Body (edit before approving)</Label>
              <Textarea
                rows={12}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            {/* Preview */}
            <div>
              <Label className="text-xs">Preview</Label>
              <div
                className="rounded-md border bg-background p-4 max-h-64 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "generate" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
              <Button onClick={handleGenerate} className="gap-1.5">
                <Sparkles className="w-4 h-4" />
                {generated ? "Regenerate" : "Generate email"}
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="ghost" onClick={() => setStep("generate")} disabled={sending} className="gap-1.5">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button onClick={send} disabled={sending || !recipient.trim()} className="gap-1.5">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Sending…" : "Approve & send"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
