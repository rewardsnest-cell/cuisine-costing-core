import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, ExternalLink, ImageIcon, Receipt as ReceiptIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/competitor-quotes/$id")({
  head: () => ({
    meta: [
      { title: "Quote comparison — Admin" },
      { name: "description", content: "Side-by-side line items: competitor price vs our price." },
    ],
  }),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-destructive">Couldn't load quote: {error.message}</p>
        <Button onClick={() => { router.invalidate(); reset(); }}>Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="p-8 text-center space-y-3">
      <p className="text-muted-foreground">Competitor quote not found.</p>
      <Link to="/admin/competitor-quotes"><Button variant="outline">Back to list</Button></Link>
    </div>
  ),
  component: QuoteCompareView,
});

type CompetitorLine = { name: string; qty: number; unitPrice: number; total: number; description?: string | null };
type OurItem = { id: string; name: string; quantity: number; unit_price: number; total_price: number };

function fmtMoney(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

function norm(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function QuoteCompareView() {
  const { id } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [converting, setConverting] = useState(false);
  const [cq, setCq] = useState<any>(null);
  const [ourItems, setOurItems] = useState<OurItem[]>([]);
  const [sourcedRecipes, setSourcedRecipes] = useState<{ id: string; name: string; category: string | null; cost_per_serving: number | null; created_at: string }[]>([]);

  const load = async () => {
    setLoading(true);
    const { data: cqData, error } = await supabase
      .from("competitor_quotes")
      .select("*, counter:quotes!competitor_quotes_counter_quote_id_fkey(id,total,subtotal,reference_number,status)")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setCq(cqData);
    if (cqData?.counter_quote_id) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("id,name,quantity,unit_price,total_price")
        .eq("quote_id", cqData.counter_quote_id);
      setOurItems((items ?? []) as OurItem[]);
    } else {
      setOurItems([]);
    }
    const { data: recs } = await (supabase as any)
      .from("recipes")
      .select("id,name,category,cost_per_serving,created_at")
      .eq("source_competitor_quote_id", id)
      .order("created_at", { ascending: true });
    setSourcedRecipes((recs ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const competitorLines = useMemo<CompetitorLine[]>(() => {
    const a = cq?.analysis ?? {};
    const candidates = [a.lineItems, a.line_items, a.items, a.menu, a.menuItems];
    let raw: any[] = [];
    for (const c of candidates) if (Array.isArray(c) && c.length) { raw = c; break; }
    return raw.map((li) => ({
      name: String(li.name ?? li.item ?? li.title ?? "Item"),
      qty: Number(li.qty ?? li.quantity ?? 1) || 1,
      unitPrice: Number(li.unitPrice ?? li.unit_price ?? li.price ?? 0) || 0,
      total: Number(li.total ?? li.totalPrice ?? li.total_price ?? 0) || 0,
      description: li.description ?? null,
    }));
  }, [cq]);

  // Pair competitor lines with our items by normalized name (greedy match)
  const rows = useMemo(() => {
    const remaining = [...ourItems];
    const paired = competitorLines.map((cl) => {
      const idx = remaining.findIndex((o) => norm(o.name) === norm(cl.name));
      let match: OurItem | null = null;
      if (idx >= 0) match = remaining.splice(idx, 1)[0];
      else {
        // fallback: contains match
        const fIdx = remaining.findIndex((o) =>
          norm(o.name).includes(norm(cl.name)) || norm(cl.name).includes(norm(o.name)),
        );
        if (fIdx >= 0) match = remaining.splice(fIdx, 1)[0];
      }
      return { competitor: cl, ours: match };
    });
    // Any of our items left over (didn't appear in competitor list) — show them too
    const extras = remaining.map((o) => ({ competitor: null as CompetitorLine | null, ours: o }));
    return [...paired, ...extras];
  }, [competitorLines, ourItems]);

  const totals = useMemo(() => {
    const compSum = competitorLines.reduce((s, l) => s + l.total, 0);
    const ourSum = ourItems.reduce((s, o) => s + Number(o.total_price ?? 0), 0);
    const guests = Number(cq?.guest_count ?? 0) || 0;
    return {
      compSum,
      ourSum,
      gap: ourSum - compSum,
      compPerGuest: guests > 0 ? compSum / guests : 0,
      ourPerGuest: guests > 0 ? ourSum / guests : 0,
    };
  }, [competitorLines, ourItems, cq]);

  const convertToReceipt = async () => {
    if (!cq?.source_image_url) {
      toast.error("No source image to convert");
      return;
    }
    setConverting(true);
    try {
      const { data, error } = await supabase
        .from("receipts")
        .insert({
          image_url: cq.source_image_url,
          status: "pending",
          receipt_date: new Date().toISOString().split("T")[0],
          raw_ocr_text: `Imported from competitor quote ${cq.competitor_name ? `(${cq.competitor_name})` : ""} on ${new Date().toLocaleDateString()}`,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Sent to Receipts. Open Receipts to run OCR.", {
        action: { label: "Open Receipts", onClick: () => window.location.assign("/admin/receipts") },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to convert");
    } finally {
      setConverting(false);
    }
  };

  const rebuild = async () => {
    setRebuilding(true);
    try {
      const { error } = await supabase.functions.invoke("build-counter-quote", {
        body: { competitorQuoteId: id },
      });
      if (error) throw error;
      toast.success("Counter rebuilt");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rebuild");
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!cq) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-muted-foreground">Competitor quote not found.</p>
        <Link to="/admin/competitor-quotes"><Button variant="outline">Back to list</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/admin/competitor-quotes" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground mb-2">
            <ArrowLeft className="w-3 h-3" /> Back to competitor quotes
          </Link>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {cq.competitor_name || "Unknown competitor"} <span className="text-muted-foreground font-normal">vs us</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {cq.client_name || "Guest"}
            {cq.event_type ? ` · ${cq.event_type}` : ""}
            {cq.event_date ? ` · ${new Date(cq.event_date).toLocaleDateString()}` : ""}
            {cq.guest_count ? ` · ${cq.guest_count} guests` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cq.source_image_url && (
            <a href={cq.source_image_url} target="_blank" rel="noreferrer">
              <Button variant="outline" className="gap-2"><ImageIcon className="w-4 h-4" /> Source image</Button>
            </a>
          )}
          {cq.source_image_url && (
            <Button variant="outline" onClick={convertToReceipt} disabled={converting} className="gap-2">
              {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptIcon className="w-4 h-4" />}
              Convert to receipt
            </Button>
          )}
          <Button onClick={rebuild} disabled={rebuilding} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${rebuilding ? "animate-spin" : ""}`} />
            {cq.counter_quote_id ? "Rebuild counter" : "Build counter"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Competitor total" value={fmtMoney(totals.compSum || cq.total)} />
        <SummaryCard label="Our total" value={fmtMoney(totals.ourSum)} accent />
        <SummaryCard
          label="Gap"
          value={`${totals.gap >= 0 ? "+" : ""}${fmtMoney(totals.gap)}`}
          tone={totals.gap >= 0 ? "green" : "red"}
        />
        <SummaryCard label="Comp / guest" value={fmtMoney(totals.compPerGuest)} />
        <SummaryCard label="Ours / guest" value={fmtMoney(totals.ourPerGuest)} accent />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Line-by-line breakdown</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Each item from the competitor's quote with our matched price.
            </p>
          </div>
          {cq.counter_quote_id && cq.counter && (
            <Link to="/admin/quotes">
              <Badge variant="outline" className="gap-1.5">
                Counter draft: {cq.counter.reference_number || "—"} <ExternalLink className="w-3 h-3" />
              </Badge>
            </Link>
          )}
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No line items found in this analysis.
              {!cq.counter_quote_id && (
                <div className="mt-3">
                  <Button onClick={rebuild} size="sm" className="gap-2">
                    <RefreshCw className="w-3.5 h-3.5" /> Build counter quote
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right text-muted-foreground">Their unit</TableHead>
                  <TableHead className="text-right text-muted-foreground">Their total</TableHead>
                  <TableHead className="text-right">Our unit</TableHead>
                  <TableHead className="text-right">Our total</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const compTotal = r.competitor?.total ?? 0;
                  const ourTotal = Number(r.ours?.total_price ?? 0);
                  const diff = ourTotal - compTotal;
                  const name = r.competitor?.name ?? r.ours?.name ?? "—";
                  const qty = r.competitor?.qty ?? r.ours?.quantity ?? "—";
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-sm">
                        <div className="font-medium">{name}</div>
                        {r.competitor?.description && (
                          <div className="text-xs text-muted-foreground">{r.competitor.description}</div>
                        )}
                        {!r.competitor && (
                          <Badge variant="outline" className="mt-1 text-[10px]">added by us</Badge>
                        )}
                        {r.competitor && !r.ours && (
                          <Badge variant="outline" className="mt-1 text-[10px] border-amber-300 text-amber-800">no match</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">{qty}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {r.competitor ? fmtMoney(r.competitor.unitPrice) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {r.competitor ? fmtMoney(r.competitor.total) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.ours ? fmtMoney(r.ours.unit_price) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {r.ours ? fmtMoney(r.ours.total_price) : "—"}
                      </TableCell>
                      <TableCell className={`text-right text-sm font-medium ${diff > 0 ? "text-green-700" : diff < 0 ? "text-red-700" : "text-muted-foreground"}`}>
                        {r.competitor && r.ours ? `${diff >= 0 ? "+" : ""}${fmtMoney(diff)}` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <tfoot>
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={3} className="text-sm">Totals</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{fmtMoney(totals.compSum)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right text-sm">{fmtMoney(totals.ourSum)}</TableCell>
                  <TableCell className={`text-right text-sm ${totals.gap >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {`${totals.gap >= 0 ? "+" : ""}${fmtMoney(totals.gap)}`}
                  </TableCell>
                </TableRow>
              </tfoot>
            </Table>
          )}
        </CardContent>
      </Card>

      {sourcedRecipes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recipes created from this quote
              <Badge variant="outline" className="ml-2 text-[10px]">{sourcedRecipes.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipe</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost / serving</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourcedRecipes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.category ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{fmtMoney(r.cost_per_serving)}</TableCell>
                    <TableCell className="text-right">
                      <Link to="/admin/recipes" search={{ recipe: r.id } as any}>
                        <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                          Review <ExternalLink className="w-3 h-3" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {cq.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{cq.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone, accent }: { label: string; value: string; tone?: "green" | "red"; accent?: boolean }) {
  const toneClass = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : accent ? "text-primary" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-semibold mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
