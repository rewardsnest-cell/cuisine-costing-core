import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, FileText, Link as LinkIcon } from "lucide-react";

export const Route = createFileRoute("/lookup")({
  head: () => ({
    meta: [
      { title: "Look Up Your Quote — TasteQuote" },
      { name: "description", content: "Find your catering quote using your reference number or email." },
    ],
  }),
  component: LookupPage,
});

function LookupPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());

  const handleClaim = async (quoteId: string) => {
    if (!user) return;
    await supabase.from("quotes").update({ user_id: user.id }).eq("id", quoteId);
    setClaimedIds((prev) => new Set(prev).add(quoteId));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearched(false);

    const trimmed = query.trim().toUpperCase();

    // Try reference number first, then email
    let { data } = await supabase
      .from("quotes")
      .select("*")
      .eq("reference_number", trimmed);

    if (!data || data.length === 0) {
      const res = await supabase
        .from("quotes")
        .select("*")
        .eq("client_email", query.trim().toLowerCase())
        .order("created_at", { ascending: false });
      data = res.data;
    }

    setResults(data || []);
    setSearched(true);
    setSearching(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <Search className="w-12 h-12 text-primary mx-auto mb-3" />
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">Look Up Your Quote</h1>
            <p className="text-muted-foreground">Enter your reference number (e.g. TQ-A3F8B2) or email address</p>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2 mb-8">
            <div className="flex-1">
              <Label className="sr-only">Reference number or email</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="TQ-XXXXXX or your@email.com"
                required
              />
            </div>
            <Button type="submit" className="bg-gradient-warm text-primary-foreground" disabled={searching}>
              {searching ? "..." : "Search"}
            </Button>
          </form>

          {searched && results.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">No quotes found. Double-check your reference number or email.</p>
              </CardContent>
            </Card>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((q) => (
                <Card key={q.id} className="hover:shadow-warm transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-semibold text-primary">{q.reference_number}</span>
                      <span className="text-xs capitalize px-2 py-0.5 bg-muted rounded-full">{q.status}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{q.event_type || "Catering Event"}</p>
                        <p className="text-sm text-muted-foreground">
                          {q.guest_count} guests · {q.event_date || "No date set"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display font-bold text-lg">${(q.total || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {user && !q.user_id && !claimedIds.has(q.id) && (
                      <Button size="sm" variant="outline" className="mt-3 w-full gap-1" onClick={() => handleClaim(q.id)}>
                        <LinkIcon className="w-3 h-3" /> Link to My Account
                      </Button>
                    )}
                    {claimedIds.has(q.id) && (
                      <p className="text-xs text-primary font-medium mt-3">✓ Linked to your account</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground mt-8">
            Want to save quotes to your account? <Link to="/signup" className="text-primary font-medium hover:underline">Create an account</Link>
          </p>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
