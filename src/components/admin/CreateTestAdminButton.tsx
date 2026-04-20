import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldCheck, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { createTestAdminUser } from "@/lib/admin/create-test-admin.functions";

export function CreateTestAdminButton({ variant = "card" }: { variant?: "card" | "inline" }) {
  const run = useServerFn(createTestAdminUser);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    created: boolean;
    email: string;
    password: string;
  }>(null);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await run();
      setResult(res);
      toast.success(
        res.created
          ? "Test admin user created"
          : "Test admin user reset (password refreshed)",
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to create test admin user");
    } finally {
      setLoading(false);
    }
  };

  const copy = (which: "email" | "password", value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  };

  const button = (
    <Button onClick={handleClick} disabled={loading} className="gap-2">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
      {loading ? "Creating…" : "Create Test Admin User"}
    </Button>
  );

  return (
    <>
      {variant === "card" ? (
        <Card className="shadow-warm border-warning/40 bg-warning/5">
          <CardContent className="p-5 flex items-center gap-4 flex-wrap">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-warning/20 text-warning shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="font-semibold">Test Admin User</p>
              <p className="text-xs text-muted-foreground">
                One-click provision of <span className="font-mono">test-admin@vpsfinest.com</span> with full Admin access. Re-running resets the password.
              </p>
            </div>
            {button}
          </CardContent>
        </Card>
      ) : (
        button
      )}

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-success" />
              Test Admin Ready
            </DialogTitle>
            <DialogDescription>
              {result?.created
                ? "The user has been created with full Admin access."
                : "The user already existed — the password has been reset."}
            </DialogDescription>
          </DialogHeader>

          {result && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Email</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-sm select-all">{result.email}</code>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => copy("email", result.email)}>
                    {copied === "email" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    {copied === "email" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Password</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-sm select-all">{result.password}</code>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => copy("password", result.password)}>
                    {copied === "password" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    {copied === "password" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <div className="rounded-md bg-success/10 border border-success/30 p-3 text-sm text-success-foreground">
                <p className="font-medium text-success">This user has full Admin access to everything.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No email was sent — credentials are shown here only. Re-run the button anytime to reset the password.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
