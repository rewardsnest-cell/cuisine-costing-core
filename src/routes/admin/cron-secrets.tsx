import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, RefreshCw, Copy, Check, AlertTriangle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/cron-secrets")({
  head: () => ({
    meta: [
      { title: "Cron & Automation Secrets — Admin" },
      { name: "description", content: "Securely manage the cron secret used to authorize scheduled jobs and automations." },
    ],
  }),
  component: CronSecretsPage,
});

const SECRET_NAME = "CRON_SECRET";

interface SecretStatus {
  name: string;
  configured: boolean;
  preview?: string | null;
  generated_at?: string | null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function CronSecretsPage() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<SecretStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_cron_secret_status" as any, { _name: SECRET_NAME });
    if (error) {
      toast.error("Could not load secret status", { description: error.message });
      setStatus({ name: SECRET_NAME, configured: false });
    } else {
      setStatus(data as SecretStatus);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleGenerate = async (regenerate: boolean) => {
    if (regenerate) {
      const ok = await confirm({
        title: "Regenerate cron secret?",
        description:
          "Regenerating will immediately invalidate the existing cron secret. Any jobs using the old secret will stop working until they are updated. Continue?",
        confirmText: "Regenerate",
        cancelText: "Cancel",
        destructive: true,
      });
      if (!ok) return;
    }

    setWorking(true);
    const { data, error } = await supabase.rpc("generate_cron_secret" as any, { _name: SECRET_NAME });
    setWorking(false);

    if (error) {
      toast.error(regenerate ? "Failed to regenerate secret" : "Failed to generate secret", {
        description: error.message,
      });
      return;
    }

    const result = data as { ok: boolean; secret: string; preview: string };
    setRevealed(result.secret);
    setCopied(false);
    toast.success(regenerate ? "Cron secret regenerated successfully." : "Cron secret generated successfully.");
    void loadStatus();
  };

  const handleCopy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      toast.success("Secret copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  if (loading) return <LoadingState label="Loading secret status…" />;

  const configured = !!status?.configured;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-muted-foreground" />
          Cron &amp; Automation Secrets
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Securely manage the secret used to authorize scheduled jobs, background workers,
          and internal automations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Cron Secret</CardTitle>
              <CardDescription className="font-mono text-xs mt-1">{SECRET_NAME}</CardDescription>
            </div>
            {configured ? (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="w-3 h-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <AlertTriangle className="w-3 h-3" />
                Not Configured
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Value</div>
              <div className="font-mono text-foreground">
                {configured ? "••••••••••••••••••••••••" : <span className="text-muted-foreground">—</span>}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Last generated</div>
              <div className="text-foreground">{formatDate(status?.generated_at)}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {!configured && (
              <Button onClick={() => handleGenerate(false)} disabled={working} className="gap-2">
                <KeyRound className="w-4 h-4" />
                {working ? "Generating…" : "Generate Cron Secret"}
              </Button>
            )}
            {configured && (
              <Button
                onClick={() => handleGenerate(true)}
                disabled={working}
                variant="outline"
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${working ? "animate-spin" : ""}`} />
                {working ? "Regenerating…" : "Regenerate Cron Secret"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <Info className="w-4 h-4" />
            What is this used for?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            This secret is used to securely authorize scheduled tasks and prevent unauthorized
            execution of cron jobs. It is provided by the scheduler in a request header and
            verified server-side against a one-way hash — the raw value is never stored or sent
            to the browser after generation.
          </p>
          <p>
            Rotate the secret if you suspect it has been exposed, or as part of routine security
            hygiene. After rotation, update any external schedulers with the new value.
          </p>
        </CardContent>
      </Card>

      {/* One-time reveal dialog */}
      <Dialog
        open={revealed !== null}
        onOpenChange={(open) => {
          if (!open) setRevealed(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your cron secret now</DialogTitle>
            <DialogDescription>
              This is the only time the full secret will be shown. Copy it and store it somewhere
              safe — it cannot be retrieved later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/50 p-3 font-mono text-xs break-all select-all">
              {revealed}
            </div>
            <Button onClick={handleCopy} variant="outline" className="w-full gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>I've saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
