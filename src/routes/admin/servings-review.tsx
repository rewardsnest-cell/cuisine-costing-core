import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Save, ChefHat, ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/servings-review")({
  head: () => ({
    meta: [
      { title: "Servings Review — TasteQuote" },
      { name: "description", content: "Fix recipes whose servings count is wrong so per-serving costs and quotes are accurate." },
    ],
  }),
  component: ServingsReview,
});

interface Row {
  id: string;
  name: string;
  category: string | null;
  servings: number;
  total_cost: number | null;
  cost_per_serving: number | null;
  draft: number;
  saving: boolean;
  saved: boolean;
}

function ServingsReview() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("recipes")
      .select("id, name, category, servings, total_cost, cost_per_serving")
      .eq("active", true)
      .eq("servings", 1)
      .order("name");
    setRows(
      (data || []).map((r: any) => ({
        ...r,
        draft: r.servings,
        saving: false,
        saved: false,
      }))
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateDraft = (id: string, value: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, draft: value, saved: false } : r)));
  };

  const save = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.draft < 1) { toast.error("Servings must be at least 1"); return; }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, saving: true } : r)));
    const { error } = await supabase.from("recipes").update({ servings: row.draft }).eq("id", id);
    if (error) {
      toast.error(error.message);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, saving: false } : r)));
      return;
    }
    toast.success(`${row.name}: servings updated to ${row.draft}`);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, saving: false, saved: true, servings: row.draft } : r)));
  };

  // Heuristic suggestion: based on category
  const suggest = (category: string | null) => {
    const c = (category || "").toLowerCase();
    if (c.includes("appetizer") || c.includes("hors")) return 12;
    if (c.includes("dessert")) return 10;
    if (c.includes("side")) return 8;
    if (c.includes("entree") || c.includes("main")) return 8;
    if (c.includes("salad")) return 6;
    if (c.includes("board") || c.includes("platter")) return 10;
    return 8;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Button>
        </Link>
      </div>

      <Card className="shadow-warm border-warning/40 bg-warning/5">
        <CardContent className="p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-lg font-semibold mb-1">Servings = 1 breaks pricing</h2>
            <p className="text-sm text-muted-foreground">
              Recipes below have <code className="text-xs bg-muted px-1.5 py-0.5 rounded">servings = 1</code>. That means cost_per_serving equals
              the entire recipe cost — fine for a single plated dish, wrong for boards, dips, and shared platters. Fix the count and the recipe cost will recompute automatically.
            </p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="shadow-warm border-success/40 bg-success/5">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
            <p className="font-semibold text-foreground">All recipes have a servings count &gt; 1.</p>
            <p className="text-sm text-muted-foreground mt-1">Nothing to review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const suggestion = suggest(r.category);
            return (
              <Card key={r.id} className={`shadow-warm border-border/50 ${r.saved ? "border-success/40 bg-success/5" : ""}`}>
                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <ChefHat className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.category || "Uncategorized"} · Total cost ${Number(r.total_cost || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Servings</p>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={r.draft}
                        onChange={(e) => updateDraft(r.id, parseInt(e.target.value) || 1)}
                        className="w-20 h-9"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateDraft(r.id, suggestion)}
                      className="text-xs"
                      title={`Common default for ${r.category || "this category"}`}
                    >
                      Use {suggestion}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => save(r.id)}
                      disabled={r.saving || r.draft === r.servings}
                      className="bg-gradient-warm text-primary-foreground gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {r.saving ? "Saving…" : r.saved ? "Saved" : "Save"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
