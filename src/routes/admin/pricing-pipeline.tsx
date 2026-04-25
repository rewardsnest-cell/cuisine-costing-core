import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, Info,
  Database, Link2, Ruler, ChefHat, Calculator, FileCheck2, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/pricing-pipeline")({
  head: () => ({
    meta: [
      { title: "Pricing Pipeline — Admin" },
      { name: "description", content: "End-to-end pricing health, errors, and retry controls." },
    ],
  }),
  component: PricingPipelinePage,
});

type Status = "success" | "warning" | "error" | "loading" | "idle";

type StepResult = {
  status: Status;
  title: string;
  detail: string;
  errors?: string[];
  metrics?: Record<string, number | string>;
};

function StatusBadge({ status }: { status: Status }) {
  if (status === "loading") return <Badge variant="outline" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> checking</Badge>;
  if (status === "success") return <Badge className="bg-success/15 text-success border border-success/30 gap-1"><CheckCircle2 className="w-3 h-3" /> success</Badge>;
  if (status === "warning") return <Badge className="bg-warning/15 text-warning border border-warning/30 gap-1"><AlertTriangle className="w-3 h-3" /> warning</Badge>;
  if (status === "error") return <Badge className="bg-destructive/15 text-destructive border border-destructive/30 gap-1"><XCircle className="w-3 h-3" /> error</Badge>;
  return <Badge variant="outline">idle</Badge>;
}

function StepCard({
  icon: Icon, index, title, purpose, result, onRetry, retrying,
}: {
  icon: any; index: number; title: string; purpose: string;
  result: StepResult; onRetry: () => void; retrying: boolean;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-4.5 h-4.5 text-foreground/70" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-muted-foreground text-sm tabular-nums">{index}.</span>
                {title}
              </CardTitle>
              <CardDescription className="mt-0.5">{purpose}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={result.status} />
            <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying || result.status === "loading"}>
              {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span className="ml-1.5">Retry</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-foreground/80">{result.detail}</p>

        {result.metrics && Object.keys(result.metrics).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.metrics).map(([k, v]) => (
              <span key={k} className="text-xs px-2 py-1 rounded-md bg-muted/50 border border-border/40">
                <span className="text-muted-foreground">{k}: </span>
                <span className="font-medium tabular-nums">{v}</span>
              </span>
            ))}
          </div>
        )}

        {result.errors && result.errors.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs font-medium text-destructive mb-1.5">Issues to resolve</p>
            <ul className="space-y-0.5 text-xs text-foreground/80 list-disc pl-4">
              {result.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
              {result.errors.length > 8 && <li className="italic text-muted-foreground">…and {result.errors.length - 8} more</li>}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const IDLE: StepResult = { status: "idle", title: "", detail: "Not yet checked." };

function PricingPipelinePage() {
  const [costs, setCosts] = useState<StepResult>(IDLE);
  const [mapping, setMapping] = useState<StepResult>(IDLE);
  const [units, setUnits] = useState<StepResult>(IDLE);
  const [recipes, setRecipes] = useState<StepResult>(IDLE);
  const [models, setModels] = useState<StepResult>(IDLE);
  const [quotes, setQuotes] = useState<StepResult>(IDLE);

  const [retrying, setRetrying] = useState<Record<string, boolean>>({});

  // ---------- step checks ----------
  const checkCosts = useCallback(async () => {
    setCosts({ ...IDLE, status: "loading", detail: "Inspecting cost sources…" });
    const { count: refCount } = await supabase.from("ingredient_reference").select("id", { count: "exact", head: true });
    const { count: noCost } = await supabase
      .from("ingredient_reference")
      .select("id", { count: "exact", head: true })
      .is("manual_unit_cost", null)
      .is("historical_avg_unit_cost", null)
      .is("kroger_unit_cost", null)
      .is("internal_estimated_unit_cost", null);
    const { count: krogerCovered } = await supabase
      .from("ingredient_reference")
      .select("id", { count: "exact", head: true })
      .not("kroger_unit_cost", "is", null);
    const { count: histCovered } = await supabase
      .from("ingredient_reference")
      .select("id", { count: "exact", head: true })
      .not("historical_avg_unit_cost", "is", null);

    const total = refCount ?? 0;
    const missing = noCost ?? 0;
    const status: Status = missing === 0 ? "success" : missing > total * 0.25 ? "error" : "warning";
    setCosts({
      status,
      title: "Cost resolution",
      detail: status === "success"
        ? "Every ingredient reference has at least one cost source (Kroger, blended receipts, or manual)."
        : `${missing} of ${total} ingredient references have no usable cost. Pricing is blocked for any recipe that depends on them.`,
      metrics: {
        "ingredient refs": total,
        "kroger-covered": krogerCovered ?? 0,
        "blended-covered": histCovered ?? 0,
        "no cost": missing,
      },
    });
  }, []);

  const checkMapping = useCallback(async () => {
    setMapping({ ...IDLE, status: "loading", detail: "Checking ingredient ↔ SKU links…" });
    const { count: refsTotal } = await supabase.from("ingredient_reference").select("id", { count: "exact", head: true });
    const { data: confirmed } = await supabase
      .from("kroger_sku_map")
      .select("reference_id")
      .eq("status", "confirmed")
      .not("reference_id", "is", null);
    const mapped = new Set((confirmed ?? []).map((r: any) => r.reference_id)).size;
    const total = refsTotal ?? 0;
    const unmapped = Math.max(0, total - mapped);
    const status: Status = total === 0 ? "warning" : mapped === 0 ? "error" : unmapped === 0 ? "success" : "warning";
    setMapping({
      status,
      title: "Ingredient ↔ SKU mapping",
      detail: mapped === 0
        ? "No ingredient references are linked to a confirmed Kroger SKU. Pricing cannot use Kroger-sourced costs."
        : unmapped === 0
          ? "All ingredient references have at least one confirmed Kroger SKU mapping."
          : `${unmapped} of ${total} ingredient references have no confirmed Kroger SKU. They fall back to blended/manual costs only.`,
      metrics: { "refs": total, "mapped": mapped, "unmapped": unmapped },
    });
  }, []);

  const checkUnits = useCallback(async () => {
    setUnits({ ...IDLE, status: "loading", detail: "Checking unit conversions…" });
    const { count: total } = await supabase.from("ingredient_reference").select("id", { count: "exact", head: true });
    const volumeUnits = ["ml", "l", "tsp", "tbsp", "cup", "floz", "fl_oz", "fl oz"];
    const { data: missing } = await supabase
      .from("ingredient_reference")
      .select("id, canonical_name, default_unit, density_g_per_ml")
      .in("default_unit", volumeUnits)
      .is("density_g_per_ml", null)
      .limit(50);
    const missCount = (missing ?? []).length;
    const status: Status = missCount === 0 ? "success" : "error";
    setUnits({
      status,
      title: "Unit conversions",
      detail: missCount === 0
        ? "All volume-based ingredients have a density set, so conversions to weight/cost work."
        : `${missCount} ingredient(s) use a volume unit but have no density. Pricing is blocked until density is added or the unit is changed.`,
      metrics: { "ingredient refs": total ?? 0, "missing density (volume)": missCount },
      errors: (missing ?? []).map((m: any) =>
        `${m.canonical_name} — unit "${m.default_unit}" needs density_g_per_ml (Admin → Ingredient Reference)`),
    });
  }, []);

  const checkRecipes = useCallback(async () => {
    setRecipes({ ...IDLE, status: "loading", detail: "Inspecting recipe pricing health…" });
    const { data, error } = await supabase.from("recipes").select("pricing_status, name");
    if (error) {
      setRecipes({ status: "error", title: "Recipe costing", detail: `Could not load recipes: ${error.message}` });
      return;
    }
    const buckets: Record<string, number> = {};
    const blockedSamples: string[] = [];
    for (const r of (data ?? []) as any[]) {
      const s = r.pricing_status || "unknown";
      buckets[s] = (buckets[s] ?? 0) + 1;
      if (s.startsWith("blocked") && blockedSamples.length < 8) {
        blockedSamples.push(`${r.name} — ${s.replace("blocked_", "blocked: ").replace(/_/g, " ")}`);
      }
    }
    const total = (data ?? []).length;
    const valid = buckets["valid"] ?? 0;
    const blocked = Object.entries(buckets).filter(([k]) => k.startsWith("blocked")).reduce((a, [, v]) => a + v, 0);
    const status: Status = blocked === 0 ? "success" : blocked > total * 0.5 ? "error" : "warning";
    setRecipes({
      status,
      title: "Recipe costing",
      detail: blocked === 0
        ? "Every recipe has a complete cost rollup."
        : `${blocked} of ${total} recipes are blocked. They cannot be quoted until upstream issues are fixed.`,
      metrics: { total, valid, blocked, ...Object.fromEntries(Object.entries(buckets).filter(([k]) => k.startsWith("blocked"))) },
      errors: blockedSamples,
    });
  }, []);

  const checkModels = useCallback(async () => {
    setModels({ ...IDLE, status: "loading", detail: "Looking for the active pricing model…" });
    const { data, error } = await supabase.from("pricing_models").select("id, name, status, activated_at").eq("status", "active");
    if (error) {
      setModels({ status: "error", title: "Pricing model", detail: `Could not load pricing models: ${error.message}` });
      return;
    }
    const active = (data ?? []).length;
    const status: Status = active === 1 ? "success" : active === 0 ? "warning" : "warning";
    setModels({
      status,
      title: "Pricing model application",
      detail: active === 0
        ? "No pricing model is active. Quotes fall back to the default markup multiplier from app_settings."
        : active === 1
          ? `Active model: ${data![0].name}. New quotes apply this model deterministically.`
          : `${active} pricing models are marked active — only one should be active at a time.`,
      metrics: { "active models": active },
    });
  }, []);

  const checkQuotes = useCallback(async () => {
    setQuotes({ ...IDLE, status: "loading", detail: "Checking recent quote readiness…" });
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { count: recent } = await supabase.from("quotes").select("id", { count: "exact", head: true }).gte("created_at", since);
    const { data: blockedRecipes } = await supabase.from("recipes").select("id").neq("pricing_status", "valid");
    const blockedIds = new Set((blockedRecipes ?? []).map((r: any) => r.id));
    const { data: items } = await supabase.from("quote_items").select("quote_id, recipe_id").gte("created_at", since);
    const affected = new Set<string>();
    for (const it of (items ?? []) as any[]) {
      if (it.recipe_id && blockedIds.has(it.recipe_id)) affected.add(it.quote_id);
    }
    const total = recent ?? 0;
    const bad = affected.size;
    const status: Status = total === 0 ? "warning" : bad === 0 ? "success" : bad > 0 ? "warning" : "success";
    setQuotes({
      status,
      title: "Quote readiness",
      detail: total === 0
        ? "No quotes created in the last 30 days."
        : bad === 0
          ? `All ${total} quotes from the last 30 days are built from valid recipes.`
          : `${bad} of ${total} recent quotes contain at least one blocked recipe. Recompute or swap the recipe before sending.`,
      metrics: { "quotes (30d)": total, "with blocked recipes": bad },
    });
  }, []);

  const runAll = useCallback(async () => {
    await Promise.all([checkCosts(), checkMapping(), checkUnits(), checkRecipes(), checkModels(), checkQuotes()]);
  }, [checkCosts, checkMapping, checkUnits, checkRecipes, checkModels, checkQuotes]);

  useEffect(() => { void runAll(); }, [runAll]);

  // ---------- retry actions (only failed steps) ----------
  const retry = async (key: string, fn: () => Promise<void>, label: string) => {
    setRetrying((s) => ({ ...s, [key]: true }));
    try {
      await fn();
      toast.success(`${label} rechecked`);
    } catch (e: any) {
      toast.error(`${label} retry failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setRetrying((s) => ({ ...s, [key]: false }));
    }
  };

  const retryRecipes = async () => {
    // Recompute only blocked recipes via existing SQL function
    const { data: blocked } = await supabase.from("recipes").select("id").neq("pricing_status", "valid");
    const ids = (blocked ?? []).map((r: any) => r.id);
    let ok = 0, fail = 0;
    for (const id of ids) {
      const { error } = await (supabase as any).rpc("recompute_recipe_cost", { _recipe_id: id });
      if (error) fail++; else ok++;
    }
    toast.success(`Recomputed ${ok} recipe(s)${fail ? `, ${fail} failed` : ""}`);
    await checkRecipes();
  };

  const overall: Status = useMemo(() => {
    const all = [costs, mapping, units, recipes, models, quotes];
    if (all.some((s) => s.status === "loading")) return "loading";
    if (all.some((s) => s.status === "error")) return "error";
    if (all.some((s) => s.status === "warning")) return "warning";
    if (all.every((s) => s.status === "success")) return "success";
    return "idle";
  }, [costs, mapping, units, recipes, models, quotes]);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Global status */}
      <Card className="shadow-warm">
        <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-primary" />
            <div>
              <h1 className="font-display text-xl font-semibold">Pricing Pipeline</h1>
              <p className="text-sm text-muted-foreground">
                End-to-end visibility from cost ingestion through quote readiness. No new pricing logic — read & retry only.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={overall} />
            <Button size="sm" variant="default" onClick={() => retry("all", runAll, "Pipeline")} disabled={!!retrying.all}>
              {retrying.all ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span className="ml-1.5">Recheck all</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pricing contract reference */}
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 flex items-start gap-2 text-xs text-foreground/80">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
        <span>
          <span className="font-medium">Pricing Contract:</span> no null costs, blended baselines, explicit unit conversions,
          deterministic pricing models, and human-gated release.
        </span>
      </div>

      <div className="space-y-4">
        <StepCard icon={Database} index={1} title="Cost resolution" purpose="Kroger average + blended receipts + manual fallbacks"
          result={costs} retrying={!!retrying.costs} onRetry={() => retry("costs", checkCosts, "Cost resolution")} />

        <StepCard icon={Link2} index={2} title="Ingredient ↔ SKU mapping" purpose="Confirmed Kroger SKUs linked to ingredient references"
          result={mapping} retrying={!!retrying.mapping} onRetry={() => retry("mapping", checkMapping, "SKU mapping")} />

        <StepCard icon={Ruler} index={3} title="Unit conversions" purpose="Volume ingredients require density to convert to cost"
          result={units} retrying={!!retrying.units} onRetry={() => retry("units", checkUnits, "Unit conversions")} />

        <Separator />

        <StepCard icon={ChefHat} index={4} title="Recipe costing" purpose="Per-recipe pricing health from cost + units + waste"
          result={recipes} retrying={!!retrying.recipes}
          onRetry={() => retry("recipes", retryRecipes, "Recipe costing")} />

        <StepCard icon={Calculator} index={5} title="Pricing model application" purpose="Exactly one active deterministic model"
          result={models} retrying={!!retrying.models} onRetry={() => retry("models", checkModels, "Pricing model")} />

        <StepCard icon={FileCheck2} index={6} title="Quote readiness" purpose="Recent quotes built only from valid recipes"
          result={quotes} retrying={!!retrying.quotes} onRetry={() => retry("quotes", checkQuotes, "Quote readiness")} />
      </div>
    </div>
  );
}
