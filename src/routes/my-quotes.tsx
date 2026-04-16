import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";

export const Route = createFileRoute("/my-quotes")({
  head: () => ({
    meta: [
      { title: "My Quotes — TasteQuote" },
      { name: "description", content: "View and manage your saved catering quotes." },
    ],
  }),
  component: MyQuotesPage,
});

function MyQuotesPage() {
  const { user, loading } = useAuth();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("quotes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setQuotes(data || []);
        setFetching(false);
      });
  }, [user]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="pt-24 pb-16 px-4 text-center">
          <h1 className="font-display text-3xl font-bold text-foreground mb-4">My Quotes</h1>
          <p className="text-muted-foreground mb-6">Sign in to view and manage your saved quotes.</p>
          <Link to="/login"><Button className="bg-gradient-warm text-primary-foreground">Sign In</Button></Link>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">My Quotes</h1>
            <Link to="/quote"><Button className="bg-gradient-warm text-primary-foreground gap-2"><Plus className="w-4 h-4" /> New Quote</Button></Link>
          </div>
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
                  <CardContent className="p-5 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{q.event_type || "Untitled Event"}</p>
                      <p className="text-sm text-muted-foreground">
                        {q.guest_count} guests · {q.event_date || "No date"} · <span className="capitalize">{q.status}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-lg">${(q.total || 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
