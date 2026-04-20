import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { KeyRound } from "lucide-react";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/set-password")({
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else { setSuccess(true); setPassword(""); setConfirm(""); }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6 max-w-lg">
      <PageHelpCard route="/admin/set-password" />
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Set / Change Password</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Add a password to your account so you can also sign in with email and password.
        </p>
        {user?.email && <p className="text-xs text-muted-foreground mt-2">Account: {user.email}</p>}
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>}
            {success && <p className="text-sm text-success bg-success/10 rounded-md p-3">Password updated successfully.</p>}
            <div>
              <Label>New password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" required />
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full bg-gradient-warm text-primary-foreground gap-2" disabled={submitting}>
              <KeyRound className="w-4 h-4" />
              {submitting ? "Updating..." : "Save password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Forgot your existing password? <Link to="/forgot-password" className="text-primary hover:underline">Use email reset instead</Link>.
      </p>
    </div>
  );
}
