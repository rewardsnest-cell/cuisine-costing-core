import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { listFlippTemplates, generateFlippImage } from "@/lib/server-fns/flipp.functions";

const LS_KEY = "flipp.template_id";

type Target =
  | { kind: "recipe"; id: string }
  | { kind: "sale_flyer"; id: string };

type Props = {
  target: Target;
  values: { name: string; value: string | null }[];
  onGenerated?: (imageUrl: string) => void;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
  label?: string;
};

export function FlippGenerateButton({ target, values, onGenerated, size = "sm", variant = "outline", label = "Generate Flipp Image" }: Props) {
  const list = useServerFn(listFlippTemplates);
  const generate = useServerFn(generateFlippImage);

  const [open, setOpen] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [templateId, setTemplateId] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem(LS_KEY) || "" : ""
  );
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>("");

  const openDialog = async () => {
    setOpen(true);
    if (templates.length === 0) {
      setLoadingTemplates(true);
      try {
        const { templates } = await list();
        setTemplates(templates);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load Flipp templates");
      } finally {
        setLoadingTemplates(false);
      }
    }
  };

  const run = async () => {
    if (!templateId) { toast.error("Pick a template"); return; }
    localStorage.setItem(LS_KEY, templateId);
    setRunning(true);
    setStatus("Sending to Flipp…");
    try {
      const out = await generate({ data: { template_id: templateId, values, target } });
      setStatus("");
      toast.success("Flipp image generated");
      onGenerated?.(out.image_url);
      setOpen(false);
    } catch (e: any) {
      setStatus("");
      toast.error(e?.message || "Flipp generation failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={openDialog} className="gap-1.5">
        <Sparkles className="w-4 h-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !running && setOpen(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Flipp Image</DialogTitle>
            <DialogDescription>
              Pick a Flipp template. Values are auto-filled from this {target.kind === "recipe" ? "recipe" : "flyer"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Template</Label>
              {loadingTemplates ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
                </div>
              ) : templates.length === 0 ? (
                <Input
                  placeholder="Template ID"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                />
              ) : (
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="rounded border bg-muted/30 p-3 text-xs space-y-1 max-h-48 overflow-auto">
              <p className="font-medium text-muted-foreground mb-1">Values being sent:</p>
              {values.length === 0 ? (
                <p className="text-muted-foreground italic">No values</p>
              ) : values.map((v) => (
                <div key={v.name} className="flex justify-between gap-3">
                  <span className="font-mono text-muted-foreground">{v.name}</span>
                  <span className="truncate text-right">{v.value ?? <em className="text-muted-foreground">empty</em>}</span>
                </div>
              ))}
            </div>
            {status && (
              <p className="text-xs text-primary flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> {status}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={running} onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={run} disabled={running || !templateId} className="gap-1.5 bg-gradient-warm text-primary-foreground">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {running ? "Rendering…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
