import { createFileRoute } from "@tanstack/react-router";
import { LegacyArchivedBanner } from "@/components/admin/LegacyArchivedBanner";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Calculator, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PRICING_VISIBILITY_KEY } from "@/lib/use-pricing-visibility";

export const Route = createFileRoute("/admin/pricing-visibility")({
  head: () => ({ meta: [{ title: "Pricing Visibility — Admin" }] }),
  component: PricingVisibilityPage,
});

type Row = {
  id: string;
  name: string;
  category: string | null;
  active: boolean;
  servings: number | null;
  total_cost: number | null;
  cost_per_serving: number | null;
  calculated_cost_per_person: number | null;
  selling_price_per_person: number | null;
  menu_price: number | null;
  markup_percentage: number | null;
  pricing_status: string | null;
  pricing_errors: any;
  is_standard: boolean;
  is_premium: boolean;
};

const MENU_FALLBACK_MARKUP = 3.5;

function PricingVisibilityPage() {
  const [hidden, setHidden] = useState<boolean>(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [globalMarkup, setGlobalMarkup] = useState<number>(3.0);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "valid" | "blocked" | "missing">("all");

  const loadAll = async () => {
    setLoading(true);
    const [{ data: kv }, { data: settings }, { data: recipes }] = await Promise.all([
      (supabase as any).from("app_kv").select("value").eq("key", PRICING_VISIBILITY_KEY).maybeSingle(),
      (supabase as any).from("app_settings").select("markup_multiplier").eq("id", 1).maybeSingle(),
      (supabase as any)
        .from("recipes")
        .select(
          "id, name, category, active, servings, total_cost, cost_per_serving, calculated_cost_per_person, selling_price_per_person, menu_price, markup_percentage, pricing_status, pricing_errors, is_standard, is_premium",
        )
        .order("name"),
    ]);
    setHidden(kv?.value === "true");
    if (settings?.markup_multiplier != null) setGlobalMarkup(Number(settings.markup_multiplier));
    setRows((recipes || []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const toggleHidden = async (next: boolean) => {
    setSavingToggle(true);
    const { error } = await (supabase as any)
      .from("app_kv")
      .upsert({ key: PRICING_VISIBILITY_KEY, value: next ? "true" : "false" }, { onConflict: "key" });
    setSavingToggle(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setHidden(next);
    toast.success(next ? "Pricing hidden on public pages" : "Pricing visible on public pages");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.name} ${r.category ?? ""}`.toLowerCase().includes(q)) return false;
      if (statusFilter === "valid" && r.pricing_status !== "valid") return false;
      if (statusFilter === "blocked" && r.pricing_status === "valid") return false;
      if (statusFilter === "missing") {
        const cps = Number(r.cost_per_serving || 0);
        if (cps > 0) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter]);

  const stats = useMemo(() => {
    let valid = 0, blocked = 0, missing = 0;
    for (const r of rows) {
      if (r.pricing_status === "valid") valid++;
      else blocked++;
      if (!r.cost_per_serving || Number(r.cost_per_serving) <= 0) missing++;
    }
    return { total: rows.length, valid, blocked, missing };
  }, [rows]);

  return (
    <div className="space-y-6 max-w-7xl">
      <LegacyArchivedBanner />
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Pricing Visibility &amp; Verification</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Toggle public pricing site-wide and review every calculated price the system would display.
        </p>
      </div>

      {/* Toggle card */}
      <Card className="border-border/60">
        <CardContent className="p-5 flex items-center gap-4 flex-wrap">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${hidden ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
            {hidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className="font-semibold text-foreground">
              {hidden ? "Pricing is hidden on public pages" : "Pricing is visible on public pages"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When hidden: menu cards, recipe lists, and the selection tray show "Request quote" instead of dollar amounts. The calculation table below always shows full numbers for verification.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="hide-toggle" className="text-sm font-medium">
              {hidden ? "Hidden" : "Visible"}
            </Label>
            <Switch id="hide-toggle" checked={hidden} disabled={savingToggle} onCheckedChange={toggleHidden} />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total recipes" value={stats.total} />
        <StatCard label="Pricing valid" value={stats.valid} tone="success" />
        <StatCard label="Pricing blocked" value={stats.blocked} tone="destructive" />
        <StatCard label="Missing cost/serving" value={stats.missing} tone="gold" />
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              Calculated pricing per recipe
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={loadAll} className="gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Global markup multiplier: <span className="font-semibold text-foreground">{globalMarkup.toFixed(2)}×</span>
            {" · "}Menu fallback markup: <span className="font-semibold text-foreground">{MENU_FALLBACK_MARKUP.toFixed(2)}×</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or category" className="pl-9" />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 text-xs">
              {(["all", "valid", "blocked", "missing"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-md capitalize transition-colors ${
                    statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading recipes…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No recipes match your filter.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 sm:mx-0">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Recipe</th>
                    <th className="px-3 py-2 font-medium text-right">Servings</th>
                    <th className="px-3 py-2 font-medium text-right">Total cost</th>
                    <th className="px-3 py-2 font-medium text-right">Cost / serving</th>
                    <th className="px-3 py-2 font-medium text-right">Markup %</th>
                    <th className="px-3 py-2 font-medium text-right">Calc. selling price</th>
                    <th className="px-3 py-2 font-medium text-right">Menu price (override)</th>
                    <th className="px-3 py-2 font-medium text-right">Public shows</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((r) => {
                    const cps = Number(r.cost_per_serving || 0);
                    const calc = Number(r.selling_price_per_person || 0);
                    const menu = r.menu_price != null ? Number(r.menu_price) : null;
                    // Mirror the resolvedPrice() used on /menu
                    let publicPrice: number;
                    if (menu != null && menu > 0) publicPrice = menu;
                    else if (calc > 0) publicPrice = calc;
                    else publicPrice = cps * MENU_FALLBACK_MARKUP;
                    const usingOverride = menu != null && menu > 0;
                    const usingFallback = !usingOverride && !(calc > 0) && cps > 0;
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{r.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {r.category || "—"}
                            {!r.active && <span className="ml-2 text-muted-foreground/70">(inactive)</span>}
                            {r.is_premium && <span className="ml-2 text-gold">Premium</span>}
                            {r.is_standard && <span className="ml-2 text-primary">Standard</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.servings ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.total_cost != null ? `$${Number(r.total_cost).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {cps > 0 ? `$${cps.toFixed(4)}` : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.markup_percentage != null && Number(r.markup_percentage) > 0
                            ? `${Number(r.markup_percentage).toFixed(0)}%`
                            : <span className="text-muted-foreground" title={`Using global markup ${globalMarkup.toFixed(2)}×`}>{globalMarkup.toFixed(2)}× (global)</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {calc > 0 ? `$${calc.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {menu != null && menu > 0 ? `$${menu.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {publicPrice > 0 ? (
                            <div>
                              <div className="font-semibold text-foreground">${publicPrice.toFixed(2)}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {usingOverride ? "menu override" : usingFallback ? `${MENU_FALLBACK_MARKUP.toFixed(1)}× fallback` : "calculated"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.pricing_status === "valid" ? (
                            <Badge variant="outline" className="border-success/40 text-success bg-success/5">valid</Badge>
                          ) : (
                            <div>
                              <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5">
                                {r.pricing_status || "blocked"}
                              </Badge>
                              {Array.isArray(r.pricing_errors) && r.pricing_errors.length > 0 && (
                                <div className="mt-1 text-[10px] text-muted-foreground max-w-[220px]">
                                  {r.pricing_errors.slice(0, 2).map((e: any, i: number) => (
                                    <div key={i} className="truncate" title={e?.message}>
                                      • {e?.ingredient ? `${e.ingredient}: ` : ""}{e?.message || JSON.stringify(e)}
                                    </div>
                                  ))}
                                  {r.pricing_errors.length > 2 && <div>+ {r.pricing_errors.length - 2} more</div>}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "success" | "destructive" | "gold" }) {
  const toneClass =
    tone === "success" ? "text-success" :
    tone === "destructive" ? "text-destructive" :
    tone === "gold" ? "text-gold" : "text-foreground";
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 font-display text-2xl font-bold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
