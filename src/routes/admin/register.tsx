import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Clock, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/admin/register")({
  head: () => ({
    meta: [
      { title: "Request Admin Access — VPS Finest" },
      { name: "description", content: "Request access to the admin dashboard." },
    ],
  }),
  component: AdminRegisterPage,
});

function AdminRegisterPage() {
  const { signUp, user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signup" | "request">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // If logged in, switch to request mode and check existing request
  useEffect(() => {
    if (user && !loading) {
      if (isAdmin) { navigate({ to: "/admin" }); return; }
      setMode("request");
      supabase.from("admin_requests").select("status").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => { if (data) setRequestStatus(data.status); });
    }
  }, [user, loading, isAdmin, navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setSubmitting(true);
    const { error } = await signUp(email, password, fullName);
    if (error) setError(error.message);
    setSubmitting(false);
  };

  const handleGoogle = async () => {
    setError("");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/admin/register",
    });
    if (result.error) setError(result.error instanceof Error ? result.error.message : String(result.error));
  };

  const handleRequest = async () => {
    if (!user) return;
    setError(""); setSubmitting(true);
    const { error } = await supabase.from("admin_requests").insert({
      user_id: user.id,
      email: user.email,
      full_name: (user.user_metadata as { full_name?: string } | null)?.full_name || user.email,
      status: "pending",
    });
    if (error) setError(error.message);
    else { setSubmitted(true); setRequestStatus("pending"); }
    setSubmitting(false);
  };

  // Logged-in: show request status / submit button
  if (user && mode === "request") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-lg bg-gradient-warm flex items-center justify-center mx-auto mb-4">
              <span className="text-primary-foreground font-bold text-lg">TQ</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">Request Admin Access</h1>
            <p className="text-sm text-muted-foreground mt-1">Signed in as {user.email}</p>
          </div>
          <Card>
            <CardContent className="p-6 space-y-4">
              {requestStatus === "pending" && (
                <div className="text-center space-y-3">
                  <Clock className="w-12 h-12 text-warning mx-auto" />
                  <p className="font-semibold text-foreground">Request Pending</p>
                  <p className="text-sm text-muted-foreground">
                    Your request is awaiting admin approval. You'll be granted access once approved.
                  </p>
                </div>
              )}
              {requestStatus === "approved" && (
                <div className="text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
                  <p className="font-semibold text-foreground">Approved!</p>
                  <Link to="/admin"><Button className="bg-gradient-warm text-primary-foreground">Go to Dashboard</Button></Link>
                </div>
              )}
              {requestStatus === "denied" && (
                <div className="text-center space-y-3">
                  <XCircle className="w-12 h-12 text-destructive mx-auto" />
                  <p className="font-semibold text-foreground">Request Denied</p>
                  <p className="text-sm text-muted-foreground">Contact an administrator for more information.</p>
                </div>
              )}
              {!requestStatus && !submitted && (
                <>
                  <p className="text-sm text-muted-foreground text-center">
                    Submit a request to be granted admin access. An existing administrator will review your request.
                  </p>
                  {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>}
                  <Button onClick={handleRequest} disabled={submitting} className="w-full bg-gradient-warm text-primary-foreground">
                    {submitting ? "Submitting..." : "Submit Request"}
                  </Button>
                </>
              )}
              <div className="text-center pt-2">
                <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
              </div>
            </CardContent>
          </Card>
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
          <h1 className="font-display text-2xl font-bold text-foreground">Register for Admin Access</h1>
          <p className="text-sm text-muted-foreground mt-1">Create an account, then request approval</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <Button type="button" variant="outline" className="w-full gap-2 mb-4" onClick={handleGoogle}>
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </Button>
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
            </div>
            <form onSubmit={handleSignUp} className="space-y-4">
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
