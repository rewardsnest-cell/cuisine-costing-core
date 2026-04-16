import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/register")({
  head: () => ({
    meta: [
      { title: "Admin Registration — TasteQuote" },
      { name: "description", content: "Register for an admin account." },
    ],
  }),
  component: AdminRegisterPage,
});

function AdminRegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setSubmitting(true);
    const { error } = await signUp(email, password, fullName);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-lg bg-gradient-warm flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-lg">TQ</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Account Created!</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Your account has been created. An existing admin will need to grant you admin access before you can use the dashboard.
          </p>
          <Link to="/admin"><Button className="bg-gradient-warm text-primary-foreground">Go to Admin Login</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-gradient-warm flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-lg">TQ</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Register Admin Account</h1>
          <p className="text-sm text-muted-foreground mt-1">Create an account and request admin access</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>}
              <div><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" required /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" required /></div>
              <Button type="submit" className="w-full bg-gradient-warm text-primary-foreground" disabled={submitting}>
                {submitting ? "Creating..." : "Create Account"}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground text-center mt-4">
              Already have an account? <Link to="/admin" className="text-primary font-medium hover:underline">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
