import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileText,
  Plus,
  Search,
  CalendarDays,
  Users,
  ClipboardList,
  User as UserIcon,
  Mail,
  KeyRound,
} from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TasteQuote" },
      { name: "description", content: "Your quotes, upcoming events, and account at a glance." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user, loading, isEmployee, signOut } = useAuth();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sendingPw, setSendingPw] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [q, p, a] = await Promise.all([
        supabase
          .from("quotes")
          .select("id, reference_number, event_type, event_date, guest_count, status, total, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
        isEmployee
          ? (supabase as any)
              .from("event_assignments")
              .select("id, role, quote:quotes(id, reference_number, client_name, event_type, event_date, guest_count, status)")
              .eq("employee_user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),
      ]);
      setQuotes(q.data || []);
      setFullName((p.data as any)?.full_name || (user.user_metadata as any)?.full_name || "");
      setAssignments((a as any).data || []);
    })();
  }, [user, isEmployee]);

  const today = new Date().toISOString().slice(0, 10);
  const upcomingQuotes = quotes.filter((q) => q.event_date && q.event_date >= today);
  const upcomingAssignments = assignments.filter(
    (a) => a.quote?.event_date && a.quote.event_date >= today,
  );

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingName(true);
    setNameMsg(null);
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: user.id, full_name: fullName, email: user.email }, { onConflict: "user_id" });
    setNameMsg(error ? "Failed to save." : "Saved.");
    setSavingName(false);
  };

  const sendPasswordReset = async () => {
    if (!user?.email) return;
    setSendingPw(true);
    setPwMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPwMsg(
      error
        ? { type: "error", text: "Could not send reset email." }
        : { type: "success", text: "Password reset email sent." },
    );
    setSendingPw(false);
  };

  if (loading) return null;

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="pt-24 pb-16 px-4 text-center">
          <h1 className="font-display text-3xl font-bold text-foreground mb-4">Dashboard</h1>
          <p className="text-muted-foreground mb-6">Sign in to access your dashboard.</p>
          <Link to="/login">
            <Button className="bg-gradient-warm text-primary-foreground">Sign In</Button>
          </Link>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">
              Welcome{fullName ? `, ${fullName.split(" ")[0]}` : ""}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{user.email}</p>
          </div>

          {/* Quick actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Link to="/quote">
                <Button className="bg-gradient-warm text-primary-foreground gap-2">
                  <Plus className="w-4 h-4" /> New Quote
                </Button>
              </Link>
              <Link to="/lookup">
                <Button variant="outline" className="gap-2">
                  <Search className="w-4 h-4" /> Look Up by Reference
                </Button>
              </Link>
              <Link to="/my-quotes">
                <Button variant="outline" className="gap-2">
                  <FileText className="w-4 h-4" /> All My Quotes
                </Button>
              </Link>
              {isEmployee && (
                <Link to="/my-events">
                  <Button variant="outline" className="gap-2">
                    <ClipboardList className="w-4 h-4" /> My Assigned Events
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* My Quotes summary */}
            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Recent Quotes
                </CardTitle>
                <Link to="/my-quotes" className="text-xs text-primary font-medium hover:underline">
                  View all
                </Link>
              </CardHeader>
              <CardContent>
                {quotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No quotes yet.</p>
                ) : (
                  <div className="space-y-2">
                    {quotes.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between border border-border/60 rounded-lg p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-primary">{q.reference_number || "—"}</p>
                          <p className="text-sm font-medium truncate">{q.event_type || "Event"}</p>
                          <p className="text-xs text-muted-foreground">
                            {q.guest_count} guests · {q.event_date || "No date"}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="font-display font-bold">${(q.total || 0).toLocaleString()}</p>
                          <p className="text-xs capitalize text-muted-foreground">{q.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming events */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" /> Upcoming Events
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Hosting
                  </p>
                  {upcomingQuotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No upcoming events.</p>
                  ) : (
                    <div className="space-y-2">
                      {upcomingQuotes.map((q) => (
                        <div key={q.id} className="border border-border/60 rounded-lg p-3">
                          <p className="text-sm font-medium">{q.event_type || "Event"}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" />
                              {q.event_date}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {q.guest_count}
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {isEmployee && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Working
                    </p>
                    {upcomingAssignments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No assigned events.</p>
                    ) : (
                      <div className="space-y-2">
                        {upcomingAssignments.map((a) => (
                          <div key={a.id} className="border border-border/60 rounded-lg p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate">
                                {a.quote?.event_type || "Event"}
                              </p>
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary shrink-0">
                                {a.role}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="w-3 h-3" />
                                {a.quote?.event_date}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {a.quote?.guest_count}
                              </span>
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Profile / account */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserIcon className="w-4 h-4" /> Profile & Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <form onSubmit={saveName} className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1">
                  <Label htmlFor="fullName" className="text-xs">
                    Full name
                  </Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="mt-1"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={savingName}
                  className="bg-gradient-warm text-primary-foreground"
                >
                  {savingName ? "Saving..." : "Save"}
                </Button>
              </form>
              {nameMsg && <p className="text-xs text-muted-foreground">{nameMsg}</p>}

              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{user.email}</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/60">
                <Button
                  variant="outline"
                  onClick={sendPasswordReset}
                  disabled={sendingPw}
                  className="gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  {sendingPw ? "Sending..." : "Change Password"}
                </Button>
                <Button variant="ghost" onClick={() => signOut()}>
                  Sign out
                </Button>
              </div>
              {pwMsg && (
                <p
                  className={`text-xs ${pwMsg.type === "success" ? "text-success" : "text-destructive"}`}
                >
                  {pwMsg.text}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
