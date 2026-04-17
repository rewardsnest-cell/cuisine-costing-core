import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password — TasteQuote" },
      { name: "description", content: "Reset your TasteQuote password." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message);
    else setSent(true);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-warm flex items-center justify-center">
              <span className="text-primary-foreground font-bold">TQ</span>
            </div>
          </Link>
          <h1 className="font-display text-2xl font-bold text-foreground">Reset password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your email and we'll send you a link to set a new password.
          </p>
        </div>
        <Card>
          <CardContent className="p-6">
            {sent ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-foreground">
                  Check your inbox at <strong>{email}</strong> for a password reset link.
                </p>
                <Link to="/login" className="inline-block text-sm text-primary font-medium hover:underline">
                  Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>}
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                </div>
                <Button type="submit" className="w-full bg-gradient-warm text-primary-foreground" disabled={submitting}>
                  {submitting ? "Sending..." : "Send reset link"}
                </Button>
                <p className="text-sm text-muted-foreground text-center">
                  Remembered it? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
