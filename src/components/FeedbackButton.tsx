import { useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { MessageSquarePlus, Loader2, CheckCircle2, Star } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

/**
 * Floating "Send feedback" button. Visible on every public/portal page.
 * Saves to public.feedback. Anyone (anon or authenticated) can submit.
 */
export function FeedbackButton() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Hide on admin (admins have their own feedback inbox there)
  if (location.pathname.startsWith("/admin")) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 4) {
      toast.error("Please share a few more details.");
      return;
    }
    if (trimmed.length > 4000) {
      toast.error("That's a bit long — please trim under 4000 characters.");
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      message: trimmed,
      page_url:
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`.slice(0, 2048)
          : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 1024) : null,
      rating: rating > 0 ? rating : null,
      user_id: user?.id ?? null,
      email: (user?.email || email || null)?.slice(0, 254) || null,
    };
    const { error } = await (supabase as any).from("feedback").insert(payload);
    setBusy(false);
    if (error) {
      toast.error("Could not send feedback. Please try again.");
      return;
    }
    setDone(true);
    setTimeout(() => {
      setOpen(false);
      setDone(false);
      setMessage("");
      setRating(0);
    }, 1400);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Send feedback"
          className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2.5 text-xs font-semibold tracking-wide shadow-lg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-opacity"
        >
          <MessageSquarePlus className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display">Share feedback</SheetTitle>
          <SheetDescription>
            Notice something off, or have a small idea? Tell us — we read every note.
          </SheetDescription>
        </SheetHeader>
        {done ? (
          <div className="mt-10 flex flex-col items-center text-center gap-2">
            <CheckCircle2 className="w-10 h-10 text-success" aria-hidden="true" />
            <p className="font-medium text-foreground">Thank you — got it.</p>
            <p className="text-sm text-muted-foreground">We appreciate the note.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider">How was it?</Label>
              <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    onClick={() => setRating(rating === n ? 0 : n)}
                    className="p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Star
                      className={`w-5 h-5 transition-colors ${
                        n <= rating ? "fill-accent text-accent" : "text-muted-foreground/40"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="fb-message">Your note</Label>
              <Textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's working? What's confusing?"
                rows={5}
                maxLength={4000}
                required
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1">{message.length}/4000</p>
            </div>
            {!user && (
              <div>
                <Label htmlFor="fb-email">Email (optional)</Label>
                <Input
                  id="fb-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="so we can reply"
                  maxLength={254}
                />
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full bg-gradient-warm text-primary-foreground gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
              Send feedback
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
