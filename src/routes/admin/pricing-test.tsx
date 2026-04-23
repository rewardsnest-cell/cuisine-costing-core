import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, FlaskConical } from "lucide-react";
import { TIERS } from "@/components/quote/types";
import { pricePerGuestForRecipe } from "@/lib/quote-recipes";

export const Route = createFileRoute("/admin/pricing-test")({
  head: () => ({ meta: [{ title: "Pricing Test — Admin" }] }),
  component: PricingTestPage,
});

const MENU_FALLBACK_MARKUP = 3.5;

type Recipe = {
  id: string;
  name: string;
  category: string | null;
  active: boolean;
  servings: number | null;
  total_cost: number | null;
  cost_per_serving: number | null;
  selling_price_per_person: number | null;
  menu_price: number | null;
  markup_percentage: number | null;
  pricing_status: string | null;
  pricing_errors: any;
  is_standard: boolean;
  is_premium: boolean;
};

type Severity = "pass" | "warn" | "fail";

type Check = {
  id: string;
  label: string;
  severity: Severity;
  detail: string;
};

function PricingTestPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [markup, setMarkup] = useState(3.0);
  const [taxRate, setTaxRate] = useState(0.08);
  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState(50);

  const load = async () => {
    setLoading(true);
    const [{ data: settings }, { data: recs }] = await Promise.all([
      (supabase as any).from("app_settings").select("markup_multiplier").eq("id", 1).maybeSingle(),
      (supabase as any)
        .from("recipes")
        .select(
          "id, name, category, active, servings, total_cost, cost_per_serving, selling_price_per_person, menu_price, markup_percentage, pricing_status, pricing_errors, is_standard, is_premium",
        )
        .order("name"),
    ]);
    if (settings?.markup_multiplier != null) setMarkup(Number(settings.markup_multiplier));
    setRecipes((recs || []) as Recipe[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ---------- Global system checks ----------
  const systemChecks: Check[] = useMemo(() => {
    const checks: Check[] = [];
    checks.push({
      id: "markup",
      label: "Global markup multiplier loaded",
      severity: markup > 0 ? "pass" : "fail",
      detail: `${markup.toFixed(2)}× from app_settings`,
    });
    checks.push({
      id: "fallback",
      label: "Menu fallback markup constant",
      severity: "pass",
      detail: `${MENU_FALLBACK_MARKUP.toFixed(2)}× when no calc/override available`,
    });
    const active = recipes.filter((r) => r.active);
    checks.push({
      id: "active",
      label: "Active recipe catalog",
      severity: active.length > 0 ? "pass" : "fail",
      detail: `${active.length} active of ${recipes.length} total`,
    });
    const blocked = active.filter((r) => r.pricing_status && r.pricing_status !== "valid").length;
    checks.push({
      id: "blocked",
      label: "Active recipes with blocked pricing",
      severity: blocked === 0 ? "pass" : blocked < 5 ? "warn" : "fail",
      detail: blocked === 0 ? "No blocked active recipes" : `${blocked} active recipe(s) blocked — they will be hidden from public surfaces`,
    });
    const missingCps = active.filter((r) => !r.cost_per_serving || Number(r.cost_per_serving) <= 0).length;
    checks.push({
      id: "cps",
      label: "Active recipes with cost/serving",
      severity: missingCps === 0 ? "pass" : missingCps < 3 ? "warn" : "fail",
      detail: missingCps === 0 ? "All active recipes have cost/serving" : `${missingCps} active recipe(s) missing cost/serving (will use fallback markup)`,
    });
    return checks;
  }, [recipes, markup]);

  // ---------- Per-recipe simulation rows ----------
  const simRows = useMemo(() => {
    return recipes.map((r) => {
      const cps = Number(r.cost_per_serving || 0);
      const calc = Number(r.selling_price_per_person || 0);
      const menu = r.menu_price != null ? Number(r.menu_price) : null;
      // Public menu price (mirrors resolvedPrice on /menu)
      let publicPrice = 0;
      let source: "menu_override" | "calculated" | "fallback" | "none" = "none";
      if (menu != null && menu > 0) { publicPrice = menu; source = "menu_override"; }
      else if (calc > 0) { publicPrice = calc; source = "calculated"; }
      else if (cps > 0) { publicPrice = cps * MENU_FALLBACK_MARKUP; source = "fallback"; }

      // Quote builder per tier (silver/gold/platinum)
      const tierPrices = TIERS.map((t) => ({
        tier: t.id,
        label: t.label,
        perGuest: pricePerGuestForRecipe({ cost_per_serving: cps }, markup, t.id, 1),
      }));

      // Sanity checks
      const issues: Check[] = [];
      if (r.active && (!r.pricing_status || r.pricing_status === "valid")) {
        if (cps <= 0) {
          issues.push({ id: "cps", label: "Missing cost/serving", severity: "warn", detail: "Quote builder will price as $0" });
        }
        if (publicPrice <= 0) {
          issues.push({ id: "public", label: "No public price", severity: "fail", detail: "Menu would show $0 / Request quote" });
        }
        if (calc > 0 && menu != null && menu > 0 && Math.abs(menu - calc) / calc > 0.5) {
          issues.push({ id: "drift", label: "Menu override differs >50% from calc", severity: "warn", detail: `override $${menu.toFixed(2)} vs calc $${calc.toFixed(2)}` });
        }
      } else if (r.active && r.pricing_status && r.pricing_status !== "valid") {
        issues.push({ id: "blocked", label: "Pricing blocked", severity: "fail", detail: r.pricing_status });
      }

      return { recipe: r, cps, calc, menu, publicPrice, source, tierPrices, issues };
    });
  }, [recipes, markup]);

  const filteredActive = simRows.filter((r) => r.recipe.active);
  const failingRows = simRows.filter((r) => r.issues.some((i) => i.severity === "fail"));
  const warningRows = simRows.filter((r) => r.issues.every((i) => i.severity !== "fail") && r.issues.some((i) => i.severity === "warn"));

  // ---------- Sample bundle simulation (typical buffet) ----------
  const sampleBundle = useMemo(() => {
    const picks = filteredActive
      .filter((r) => r.cps > 0)
      .slice(0, 4); // first 4 priced recipes as a demo bundle
    const subtotalsByTier = TIERS.map((t) => {
      const perGuest = picks.reduce((s, r) => s + pricePerGuestForRecipe({ cost_per_serving: r.cps }, markup, t.id, 1), 0);
      const subtotal = perGuest * Math.max(guests, 1);
      const total = subtotal * (1 + taxRate);
      // Mirror recalc-quote-pricing: round per-guest UP to next $5
      const roundedPerGuest = Math.ceil(perGuest / 5) * 5;
      const roundedSubtotal = roundedPerGuest * Math.max(guests, 1);
      const roundedTotal = roundedSubtotal * (1 + taxRate);
      return { tier: t.id, label: t.label, perGuest, subtotal, total, roundedPerGuest, roundedSubtotal, roundedTotal };
    });
    return { picks, subtotalsByTier };
  }, [filteredActive, markup, guests, taxRate]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-primary" /> Pricing Test
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Pre-flight checks for every public pricing surface. Run this before turning pricing visibility ON.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Re-run
        </Button>
      </div>

      {/* System summary */}
      <Card className="border-border/60">
        <CardHeader className="pb-3"><CardTitle className="text-base">System checks</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {systemChecks.map((c) => <CheckRow key={c.id} check={c} />)}
          </ul>
        </CardContent>
      </Card>

      {/* Tabs for surfaces */}
      <Tabs defaultValue="recipes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recipes">Public menu / recipe</TabsTrigger>
          <TabsTrigger value="quote">Quote builder (per tier)</TabsTrigger>
          <TabsTrigger value="bundle">Sample bundle</TabsTrigger>
          <TabsTrigger value="issues">
            Issues
            {failingRows.length > 0 && <Badge variant="outline" className="ml-2 border-destructive/40 text-destructive bg-destructive/5">{failingRows.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recipes">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Per-recipe public price simulation</CardTitle>
              <p className="text-xs text-muted-foreground">
                What menu cards, recipe lists and the selection tray would display per recipe.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Recipe</th>
                    <th className="px-3 py-2 font-medium text-right">Cost / serving</th>
                    <th className="px-3 py-2 font-medium text-right">Calc selling</th>
                    <th className="px-3 py-2 font-medium text-right">Menu override</th>
                    <th className="px-3 py-2 font-medium text-right">Public shows</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {simRows.map((row) => (
                    <tr key={row.recipe.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{row.recipe.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {row.recipe.category || "—"}
                          {!row.recipe.active && <span className="ml-2">(inactive)</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.cps > 0 ? `$${row.cps.toFixed(4)}` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.calc > 0 ? `$${row.calc.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.menu != null && row.menu > 0 ? `$${row.menu.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {row.publicPrice > 0 ? `$${row.publicPrice.toFixed(2)}` : <span className="text-destructive">$0.00</span>}
                      </td>
                      <td className="px-3 py-2">
                        <SourceBadge source={row.source} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quote">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quote builder — per-guest by tier</CardTitle>
              <p className="text-xs text-muted-foreground">
                Mirror of <code>pricePerGuestForRecipe</code>: cost/serving × markup ({markup.toFixed(2)}×) × tier multiplier.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Recipe</th>
                    {TIERS.map((t) => (
                      <th key={t.id} className="px-3 py-2 font-medium text-right">
                        {t.label} <span className="text-[10px] text-muted-foreground">({t.multiplier}×)</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredActive.map((row) => (
                    <tr key={row.recipe.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{row.recipe.name}</div>
                        <div className="text-[11px] text-muted-foreground">cps ${row.cps.toFixed(4)}</div>
                      </td>
                      {row.tierPrices.map((tp) => (
                        <td key={tp.tier} className="px-3 py-2 text-right tabular-nums">
                          {tp.perGuest > 0 ? `$${tp.perGuest.toFixed(2)}` : <span className="text-destructive">$0.00</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bundle">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sample 4-recipe bundle</CardTitle>
              <p className="text-xs text-muted-foreground">
                Simulates a typical quote (first 4 priced active recipes), including the per-guest "round up to next $5" rule from <code>recalcQuotePricing</code>.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <Label className="text-xs">Guests</Label>
                  <Input type="number" min={1} value={guests} onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))} className="w-24" />
                </div>
                <div>
                  <Label className="text-xs">Tax rate</Label>
                  <Input type="number" step="0.001" value={taxRate} onChange={(e) => setTaxRate(Math.max(0, Number(e.target.value) || 0))} className="w-24" />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Bundle:{" "}
                {sampleBundle.picks.length === 0
                  ? "no priced active recipes available"
                  : sampleBundle.picks.map((p) => p.recipe.name).join(" · ")}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {sampleBundle.subtotalsByTier.map((t) => (
                  <Card key={t.tier} className="border-border/60">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{t.label}</div>
                        <Badge variant="outline">tier</Badge>
                      </div>
                      <Row label="Per guest (raw)" value={`$${t.perGuest.toFixed(2)}`} />
                      <Row label="Per guest (rounded ↑$5)" value={`$${t.roundedPerGuest.toFixed(2)}`} bold />
                      <Row label={`Subtotal × ${guests}`} value={`$${t.roundedSubtotal.toFixed(2)}`} />
                      <Row label={`Total (incl ${(taxRate * 100).toFixed(1)}% tax)`} value={`$${t.roundedTotal.toFixed(2)}`} bold />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Failures ({failingRows.length}) and warnings ({warningRows.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground">Resolve failures before flipping public pricing ON.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {failingRows.length === 0 && warningRows.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="w-4 h-4" /> All recipes pass simulation. Safe to enable public pricing.
                </div>
              )}
              {[...failingRows, ...warningRows].map((row) => (
                <div key={row.recipe.id} className="border border-border/60 rounded-lg p-3">
                  <div className="font-medium text-foreground">{row.recipe.name}</div>
                  <div className="text-[11px] text-muted-foreground mb-2">{row.recipe.category || "—"}</div>
                  <ul className="space-y-1.5">
                    {row.issues.map((i) => <CheckRow key={i.id} check={i} />)}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold text-foreground" : ""}`}>{value}</span>
    </div>
  );
}

function CheckRow({ check }: { check: Check }) {
  const Icon = check.severity === "pass" ? CheckCircle2 : check.severity === "warn" ? AlertTriangle : XCircle;
  const tone =
    check.severity === "pass" ? "text-success" :
    check.severity === "warn" ? "text-gold" : "text-destructive";
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${tone}`} />
      <div className="min-w-0">
        <div className="text-foreground">{check.label}</div>
        <div className="text-xs text-muted-foreground">{check.detail}</div>
      </div>
    </li>
  );
}

function SourceBadge({ source }: { source: "menu_override" | "calculated" | "fallback" | "none" }) {
  if (source === "menu_override") return <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5">menu override</Badge>;
  if (source === "calculated") return <Badge variant="outline" className="border-success/40 text-success bg-success/5">calculated</Badge>;
  if (source === "fallback") return <Badge variant="outline" className="border-gold/40 text-gold bg-gold/5">{MENU_FALLBACK_MARKUP.toFixed(1)}× fallback</Badge>;
  return <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5">no price</Badge>;
}
