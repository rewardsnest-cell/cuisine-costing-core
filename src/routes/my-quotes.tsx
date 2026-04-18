import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Plus, LinkIcon } from "lucide-react";

export const Route = createFileRoute("/my-quotes")({
  head: () => ({
    meta: [
      { title: "My Quotes — VPS Finest" },
      { name: "description", content: "View and manage your saved catering quotes." },
    ],
  }),
  component: MyQuotesPage,
});

function MyQuotesPage() {
  const { user, loading } = useAuth();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [refInput, setRefInput] = useState("");
  const [linkMsg, setLinkMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [linking, setLinking] = useState(false);
  const [autoLinkedCount, setAutoLinkedCount] = useState(0);

  const loadQuotes = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    const { data } = await supabase
      .from("quotes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setQuotes(data || []);
    setFetching(false);
  }, [user]);

  // Auto-link any guest quotes from this browser session
  useEffect(() => {
    if (!user) return;
    const run = async () => {
      let linkedNow = 0;
      if (typeof window !== "undefined") {
        try {
          const ids: string[] = JSON.parse(localStorage.getItem("guest_quote_ids") || "[]");
          if (ids.length > 0) {
            const { data: updated } = await supabase
              .from("quotes")
              .update({ user_id: user.id })
              .in("id", ids)
              .is("user_id", null)
              .select("id");
            linkedNow = updated?.length || 0;
            localStorage.removeItem("guest_quote_ids");
          }
        } catch {}
      }
      if (linkedNow > 0) setAutoLinkedCount(linkedNow);
      await loadQuotes();
    };
    run();
  }, [user, loadQuotes]);

  const handleLinkByRef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !refInput.trim()) return;
    setLinking(true);
    setLinkMsg(null);
    const ref = refInput.trim().toUpperCase();
    const { data: quote, error: findErr } = await supabase
      .from("quotes")
      .select("id, user_id, reference_number")
      .eq("reference_number", ref)
      .maybeSingle();
    if (findErr || !quote) {
      setLinkMsg({ type: "error", text: "Quote not found. Check the reference number." });
      setLinking(false);
      return;
    }
    if (quote.user_id && quote.user_id !== user.id) {
      setLinkMsg({ type: "error", text: "This quote is already linked to another account." });
      setLinking(false);
      return;
    }
    if (quote.user_id === user.id) {
      setLinkMsg({ type: "success", text: "This quote is already linked to your account." });
      setLinking(false);
      return;
    }
    const { error: updateErr } = await supabase
      .from("quotes")
      .update({ user_id: user.id })
      .eq("id", quote.id);
    if (updateErr) {
      setLinkMsg({ type: "error", text: "Failed to link quote. Please try again." });
    } else {
      setLinkMsg({ type: "success", text: `Quote ${ref} linked to your account.` });
      setRefInput("");
      await loadQuotes();
    }
    setLinking(false);
  };

  if (loading) return null;

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="pt-24 pb-16 px-4 text-center">
          <h1 className="font-display text-3xl font-bold text-foreground mb-4">My Quotes</h1>
          <p className="text-muted-foreground mb-6">Sign in to view and manage your saved quotes.</p>
          <Link to="/login"><Button className="bg-gradient-warm text-primary-foreground">Sign In</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-display text-3xl font-bold text-foreground">My Quotes</h1>
            <Link to="/quote"><Button className="bg-gradient-warm text-primary-foreground gap-2"><Plus className="w-4 h-4" /> New Quote</Button></Link>
          </div>

          {autoLinkedCount > 0 && (
            <div className="mb-4 bg-success/10 border border-success/20 text-success-foreground rounded-lg p-3 text-sm">
              ✓ Linked {autoLinkedCount} guest quote{autoLinkedCount > 1 ? "s" : ""} to your account.
            </div>
          )}

          {/* Manual link by reference */}
          <Card className="mb-6">
            <CardContent className="p-5">
              <form onSubmit={handleLinkByRef} className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1">
                  <Label className="text-xs">Have a quote reference? Link it to your account</Label>
                  <Input
                    value={refInput}
                    onChange={(e) => setRefInput(e.target.value)}
                    placeholder="TQ-XXXXXX"
                    className="mt-1 font-mono uppercase"
                  />
                </div>
                <Button type="submit" disabled={linking || !refInput.trim()} className="bg-gradient-warm text-primary-foreground gap-2">
                  <LinkIcon className="w-4 h-4" /> {linking ? "Linking..." : "Link Quote"}
                </Button>
              </form>
              {linkMsg && (
                <p className={`text-xs mt-2 ${linkMsg.type === "success" ? "text-success" : "text-destructive"}`}>
                  {linkMsg.text}
                </p>
              )}
            </CardContent>
          </Card>

          {fetching ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : quotes.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">No quotes yet. Create your first one!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {quotes.map((q) => (
                <Card key={q.id} className="hover:shadow-warm transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-semibold text-primary">{q.reference_number || "—"}</span>
                      <span className="text-xs capitalize px-2 py-0.5 bg-muted rounded-full">{q.status}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{q.event_type || "Untitled Event"}</p>
                        <p className="text-sm text-muted-foreground">
                          {q.guest_count} guests · {q.event_date || "No date"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display font-bold text-lg">${(q.total || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
