import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getQuoteMarginVariance } from "@/lib/server-fns/margin-reporting.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingState } from "@/components/LoadingState";
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";

export const Route = createFileRoute("/admin/quotes/$id")({
  head: () => ({
    meta: [{ title: "Quote Details — Admin" }],
  }),
  component: QuoteDetailPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 space-y-3">
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
        <button
          className="text-sm underline"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Retry
        </button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="p-6">
      <p className="text-sm">Quote not found.</p>
      <Link to="/admin/quotes" className="text-sm underline">
        Back to quotes
      </Link>
    </div>
  ),
});

type Variance = Awaited<ReturnType<typeof getQuoteMarginVariance>>;

function QuoteDetailPage() {
  const { id } = Route.useParams();
  const varianceFn = useServerFn(getQuoteMarginVariance);
  const [quote, setQuote] = useState<any | null>(null);
  const [variance, setVariance] = useState<Variance | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data: q, error } = await supabase
          .from("quotes")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        setQuote(q);
        try {
          const v = await varianceFn({ data: { quote_id: id } });
          if (!cancelled) setVariance(v);
        } catch (e: any) {
          if (!cancelled) setErr(e?.message || "Failed to load margin variance");
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load quote");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, varianceFn]);

  if (loading) return <LoadingState label="Loading quote…" />;
  if (!quote)
    return (
      <div className="p-6">
        <p className="text-sm">Quote not found.</p>
        <Link to="/admin/quotes" className="text-sm underline">
          Back
        </Link>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/admin/quotes"
            className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to quotes
          </Link>
          <h1 className="font-display text-3xl font-bold mt-2">
            {quote.client_name || "Unnamed Quote"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {quote.reference_number ? `${quote.reference_number} · ` : ""}
            {quote.event_type || "Event"} · {quote.guest_count} guests ·{" "}
            {quote.event_date || "TBD"}
          </p>
        </div>
      </div>

      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      <MarginVarianceCard variance={variance} />
    </div>
  );
}

function MarginVarianceCard({ variance }: { variance: Variance | null }) {
  if (!variance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Margin Variance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No margin data available.</p>
        </CardContent>
      </Card>
    );
  }

  const VarIcon =
    variance.variance > 0 ? TrendingUp : variance.variance < 0 ? TrendingDown : Minus;
  const varTone =
    variance.variance > 0
      ? "text-destructive"
      : variance.variance < 0
        ? "text-success"
        : "text-muted-foreground";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <VarIcon className={`w-4 h-4 ${varTone}`} /> Margin Variance — Quoted vs Actual
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <Stat label="Revenue" value={`$${variance.revenue.toFixed(2)}`} />
          <Stat label="Quoted Cost" value={`$${variance.quotedCost.toFixed(2)}`} />
          <Stat label="Actual Cost" value={`$${variance.actualCost.toFixed(2)}`} />
          <Stat
            label="$ Variance"
            value={`$${variance.variance.toFixed(2)}`}
            tone={variance.variance > 0 ? "bad" : variance.variance < 0 ? "good" : undefined}
          />
          <Stat
            label="% Variance"
            value={`${variance.variancePct}%`}
            tone={
              variance.variancePct > 0 ? "bad" : variance.variancePct < 0 ? "good" : undefined
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border text-sm">
          <Stat
            label="Quoted Margin"
            value={`${variance.quotedMarginPct}%`}
            tone={variance.quotedMarginPct >= 30 ? "good" : "bad"}
          />
          <Stat
            label="Actual Margin"
            value={`${variance.actualMarginPct}%`}
            tone={variance.actualMarginPct >= 30 ? "good" : "bad"}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Read-only. Quoted cost from quote theoretical cost; actual cost from linked receipts.
          Positive variance = actual exceeded quoted (margin loss).
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`font-semibold tabular-nums ${
          tone === "bad" ? "text-destructive" : tone === "good" ? "text-success" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
