import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/admin/quotes")({
  component: QuotesPage,
});

type Quote = {
  id: string;
  client_name: string | null;
  client_email: string | null;
  event_type: string | null;
  event_date: string | null;
  guest_count: number;
  total: number;
  status: string;
  created_at: string;
};

function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    supabase.from("quotes").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setQuotes(data as Quote[]);
    });
  }, []);

  const statusColor = (s: string) => {
    switch (s) {
      case "won": return "bg-success/10 text-success";
      case "sent": return "bg-gold/20 text-warm";
      case "lost": return "bg-destructive/10 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {quotes.length === 0 ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No quotes yet. Customer quote submissions will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map((q) => (
            <Card key={q.id} className="shadow-warm border-border/50">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{q.client_name || "Unnamed"}</p>
                  <p className="text-sm text-muted-foreground">{q.event_type || "Event"} · {q.guest_count} guests · {q.event_date || "TBD"}</p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(q.status)}`}>{q.status}</span>
                <p className="font-display text-lg font-bold">${Number(q.total).toFixed(2)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
