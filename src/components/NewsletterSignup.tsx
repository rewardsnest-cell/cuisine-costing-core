import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, Download, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  source?: string;
  variant?: "card" | "inline" | "footer";
  className?: string;
}

/**
 * Calm, inline newsletter signup. Saves to newsletter_subscribers.
 * After signup, surfaces the active "Free Weeknight Recipe Guide" PDF if one is published.
 */
export function NewsletterSignup({ source = "site", variant = "card", className = "" }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254) {
      toast.error("Please enter a valid email.");
      return;
    }
    setStatus("loading");
    const { error } = await (supabase as any)
      .from("newsletter_subscribers")
      .insert({ email: trimmed, source });
    // 23505 = unique violation; treat as success ("you're already on the list")
    if (error && (error as any).code !== "23505") {
      setStatus("idle");
      toast.error("Could not subscribe. Please try again.");
      return;
    }

    // Try to fetch the active guide URL from app_kv
    const { data: kv } = await (supabase as any)
      .from("app_kv")
      .select("value")
      .eq("key", "newsletter_guide_pdf_url")
      .maybeSingle();
    setPdfUrl(kv?.value || null);
    setStatus("done");
  }

  if (variant === "footer") {
    return (
      <div className={className}>
        {status === "done" ? (
          <DoneState pdfUrl={pdfUrl} compact />
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background/10 border-background/20 text-background placeholder:text-background/50 focus-visible:ring-background/40"
              />
              <Button type="submit" disabled={status === "loading"} variant="secondary" className="shrink-0">
                {status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}
              </Button>
            </div>
            <p className="text-[11px] text-background/55 leading-relaxed">
              Free Weeknight Recipe Guide · One calm note a month · Unsubscribe anytime.
            </p>
          </form>
        )}
      </div>
    );
  }

  return (
    <Card className={`p-6 sm:p-8 border-border/60 shadow-sm ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-xl font-bold text-foreground leading-tight">
            Free Weeknight Recipe Guide
          </h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Five reliable recipes we cook on busy nights. Plus one calm note a month — never spammy.
          </p>
        </div>
      </div>
      {status === "done" ? (
        <DoneState pdfUrl={pdfUrl} />
      ) : (
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            required
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" disabled={status === "loading"} className="shrink-0">
            {status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Get the guide"}
          </Button>
        </form>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">
        We'll email the PDF and add you to the monthly note. Unsubscribe anytime.
      </p>
    </Card>
  );
}

function DoneState({ pdfUrl, compact = false }: { pdfUrl: string | null; compact?: boolean }) {
  return (
    <div className={compact ? "" : "py-2"}>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
        <CheckCircle2 className="w-4 h-4 text-success" />
        You're on the list — thank you.
      </div>
      {pdfUrl ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Download className="w-3.5 h-3.5" /> Download the recipe guide (PDF)
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">We'll email the guide as soon as it's ready.</p>
      )}
    </div>
  );
}
