import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Lock, Check } from "lucide-react";
import { toast } from "sonner";
import { SALES_SCRIPTS } from "@/lib/sales-hub/scripts";

export const Route = createFileRoute("/admin/sales-hub/scripts")({
  component: ScriptsPage,
});

function ScriptsPage() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (id: string, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(id);
      toast.success("Script copied");
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4 text-sm flex items-start gap-2">
          <Lock className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="font-medium">Locked scripts.</p>
            <p className="text-muted-foreground">
              These are read-only on this page so they don't get accidentally edited. Copy and paste them as-is, or adapt them in your call/email when needed.
            </p>
          </div>
        </CardContent>
      </Card>

      {SALES_SCRIPTS.map((s) => (
        <Card key={s.id}>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-semibold">{s.title}</h3>
                <p className="text-xs text-muted-foreground">{s.context}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => copy(s.id, s.body)} className="gap-1.5 shrink-0">
                {copied === s.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied === s.id ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/40 border rounded p-4 text-foreground/90">
{s.body}
            </pre>
            <Badge variant="outline" className="gap-1"><Lock className="w-3 h-3" />Locked</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
