import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { previewOutreachTemplate, type PreviewResult } from "@/lib/email/preview-template.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

const STAGES = [
  { value: "prospect-followup-day0", label: "Day 0 — Intro" },
  { value: "prospect-followup-day5", label: "Day 5 — Follow-up" },
  { value: "prospect-followup-day14", label: "Day 14 — Final" },
] as const;

type StageValue = typeof STAGES[number]["value"];

export interface PreviewLead {
  id: string;
  contactName?: string | null;
  businessName?: string | null;
  email?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead?: PreviewLead | null;
  /** Default tab to open. */
  defaultStage?: StageValue;
}

const levelMeta = {
  error: { icon: AlertCircle, badge: "destructive" as const, label: "Error" },
  warning: { icon: AlertTriangle, badge: "secondary" as const, label: "Warning" },
  info: { icon: Info, badge: "outline" as const, label: "Info" },
};

export function TemplatePreviewDialog({ open, onOpenChange, lead, defaultStage }: Props) {
  const previewFn = useServerFn(previewOutreachTemplate);
  const [stage, setStage] = useState<StageValue>(defaultStage ?? "prospect-followup-day0");
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed form whenever the dialog opens with a different lead.
  useEffect(() => {
    if (!open) return;
    setStage(defaultStage ?? "prospect-followup-day0");
    setContactName(lead?.contactName ?? "");
    setBusinessName(lead?.businessName ?? "");
    setEmail(lead?.email ?? "");
    setResult(null);
    setError(null);
  }, [open, lead?.id, defaultStage]);

  // Auto-render whenever stage or fields change.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    previewFn({
      data: {
        templateName: stage,
        contactName,
        businessName,
        email,
      },
    })
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Preview failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, stage, contactName, businessName, email, previewFn]);

  const errorCount = useMemo(() => result?.issues.filter((i) => i.level === "error").length ?? 0, [result]);
  const warnCount = useMemo(() => result?.issues.filter((i) => i.level === "warning").length ?? 0, [result]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Email preview &amp; personalization check</DialogTitle>
          <DialogDescription>
            Render Day 0, Day 5, and Day 14 templates against sample contact data and review any
            personalization issues before sending.
          </DialogDescription>
        </DialogHeader>

        {/* Sample data form */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div>
            <Label htmlFor="prev-name" className="text-xs">Contact name</Label>
            <Input id="prev-name" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Pat" />
          </div>
          <div>
            <Label htmlFor="prev-biz" className="text-xs">Business name</Label>
            <Input id="prev-biz" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Bertram Inn" />
          </div>
          <div>
            <Label htmlFor="prev-email" className="text-xs">Recipient email</Label>
            <Input id="prev-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="someone@example.com" />
          </div>
        </div>

        <Tabs value={stage} onValueChange={(v) => setStage(v as StageValue)} className="mt-2">
          <TabsList className="grid grid-cols-3 w-full">
            {STAGES.map((s) => (
              <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
            ))}
          </TabsList>

          {STAGES.map((s) => (
            <TabsContent key={s.value} value={s.value} className="mt-3 space-y-3">
              {/* Status row */}
              <div className="flex items-center gap-2 flex-wrap">
                {loading ? (
                  <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Rendering…</Badge>
                ) : error ? (
                  <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />{error}</Badge>
                ) : result?.ok ? (
                  <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-600"><CheckCircle2 className="h-3 w-3" />Safe to send</Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Blocked — fix errors below</Badge>
                )}
                {!loading && result && (
                  <>
                    {errorCount > 0 && <Badge variant="destructive">{errorCount} error{errorCount > 1 ? "s" : ""}</Badge>}
                    {warnCount > 0 && <Badge variant="secondary">{warnCount} warning{warnCount > 1 ? "s" : ""}</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto truncate">
                      <span className="font-medium">Subject:</span> {result.subject}
                    </span>
                  </>
                )}
              </div>

              {/* Issues list */}
              {result && result.issues.length > 0 && (
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                  {result.issues.map((issue, i) => {
                    const meta = levelMeta[issue.level];
                    const Icon = meta.icon;
                    return (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${
                          issue.level === "error" ? "text-destructive" :
                          issue.level === "warning" ? "text-amber-600" : "text-muted-foreground"
                        }`} />
                        <div className="flex-1">
                          <div className="font-medium capitalize">{issue.field}</div>
                          <div className="text-muted-foreground">{issue.message}</div>
                        </div>
                        <Badge variant={meta.badge} className="shrink-0">{meta.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Rendered preview */}
              <div className="border rounded-md overflow-hidden bg-white">
                {result ? (
                  <iframe
                    title={`${s.label} preview`}
                    srcDoc={result.html}
                    sandbox=""
                    className="w-full h-[420px] border-0"
                  />
                ) : (
                  <div className="h-[420px] flex items-center justify-center text-sm text-muted-foreground">
                    {loading ? "Rendering…" : "—"}
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
