import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Sparkles, Loader2, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateOutreachDraft, type DraftResult } from "@/lib/outreach/generate-draft";

export type DraftLead = {
  id: string;
  name: string | null;
  company: string | null;
  organization_type?: string | null;
  catering_use_cases?: string[];
  email?: string | null;
};

type Channel = "email" | "sms" | "voicemail";

export function OutreachDraftDialog({
  open, onOpenChange, lead,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: DraftLead | null;
}) {
  const generate = useServerFn(generateOutreachDraft);
  const [channels, setChannels] = useState<Channel[]>(["email", "sms"]);
  const [tone, setTone] = useState<"warm" | "professional" | "casual" | "concise">("warm");
  const [goal, setGoal] = useState<"intro" | "follow_up" | "re_engage" | "book_meeting" | "menu_share">("intro");
  const [senderName, setSenderName] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const toggleChannel = (c: Channel) => {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const onGenerate = async () => {
    if (!lead) return;
    if (channels.length === 0) {
      toast.error("Pick at least one channel");
      return;
    }
    setLoading(true);
    setDraft(null);
    try {
      const result = await generate({
        data: {
          leadId: lead.id,
          channels,
          tone,
          goal,
          senderName: senderName || undefined,
          extraContext: extraContext || undefined,
        },
      });
      setDraft(result);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate draft");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const firstTab: Channel | null =
    draft?.email ? "email" : draft?.sms ? "sms" : draft?.voicemail ? "voicemail" : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Generate outreach draft
          </DialogTitle>
          {lead && (
            <DialogDescription>
              For <span className="font-medium">{lead.company || lead.name || "contact"}</span>
              {lead.organization_type && <> • {lead.organization_type}</>}
              {lead.catering_use_cases && lead.catering_use_cases.length > 0 && (
                <span className="ml-1">• {lead.catering_use_cases.slice(0, 3).join(", ")}</span>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Channels</Label>
            <div className="flex flex-wrap gap-2">
              {(["email", "sms", "voicemail"] as Channel[]).map((c) => {
                const active = channels.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleChannel(c)}
                    className="focus:outline-none"
                  >
                    <Badge variant={active ? "default" : "outline"} className="cursor-pointer capitalize">
                      {c}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Goal</Label>
              <Select value={goal} onValueChange={(v) => setGoal(v as typeof goal)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="intro">First introduction</SelectItem>
                  <SelectItem value="follow_up">Follow-up</SelectItem>
                  <SelectItem value="re_engage">Re-engage</SelectItem>
                  <SelectItem value="book_meeting">Book a meeting</SelectItem>
                  <SelectItem value="menu_share">Share menus</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="warm">Warm</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="concise">Concise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Your name (sign-off)</Label>
            <Input
              placeholder="e.g. Alex from VPS Finest"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Extra context (optional)</Label>
            <Textarea
              rows={2}
              placeholder="e.g. mention our new fall menu; they hosted a 200-person retreat last year"
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={onGenerate} disabled={loading}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
              ) : draft ? (
                <><RefreshCw className="h-4 w-4 mr-2" />Regenerate</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />Generate drafts</>
              )}
            </Button>
          </div>

          {draft && firstTab && (
            <Tabs defaultValue={firstTab} className="w-full">
              <TabsList>
                {draft.email && <TabsTrigger value="email">Email</TabsTrigger>}
                {draft.sms && <TabsTrigger value="sms">SMS</TabsTrigger>}
                {draft.voicemail && <TabsTrigger value="voicemail">Voicemail</TabsTrigger>}
              </TabsList>

              {draft.email && (
                <TabsContent value="email" className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Subject</Label>
                      <Button size="sm" variant="ghost" onClick={() => copy("subj", draft.email!.subject)}>
                        {copiedKey === "subj" ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                        Copy
                      </Button>
                    </div>
                    <Input readOnly value={draft.email.subject} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Body</Label>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => copy("body", draft.email!.body)}>
                          {copiedKey === "body" ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                          Body
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copy("all", `Subject: ${draft.email!.subject}\n\n${draft.email!.body}`)}
                        >
                          {copiedKey === "all" ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                          All
                        </Button>
                      </div>
                    </div>
                    <Textarea readOnly value={draft.email.body} rows={12} className="font-mono text-sm" />
                  </div>
                  {lead?.email && (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`mailto:${lead.email}?subject=${encodeURIComponent(draft.email.subject)}&body=${encodeURIComponent(draft.email.body)}`}
                      >Open in mail app</a>
                    </Button>
                  )}
                </TabsContent>
              )}

              {draft.sms && (
                <TabsContent value="sms" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>SMS message</Label>
                    <Button size="sm" variant="ghost" onClick={() => copy("sms", draft.sms!.body)}>
                      {copiedKey === "sms" ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      Copy
                    </Button>
                  </div>
                  <Textarea readOnly value={draft.sms.body} rows={5} />
                  <p className="text-xs text-muted-foreground">{draft.sms.body.length} characters</p>
                </TabsContent>
              )}

              {draft.voicemail && (
                <TabsContent value="voicemail" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Voicemail script</Label>
                    <Button size="sm" variant="ghost" onClick={() => copy("vm", draft.voicemail!.body)}>
                      {copiedKey === "vm" ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      Copy
                    </Button>
                  </div>
                  <Textarea readOnly value={draft.voicemail.body} rows={6} />
                </TabsContent>
              )}
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
