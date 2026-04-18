import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Zap, Plus, X, Loader2 } from "lucide-react";
import { MENU_STYLES, SERVICE_STYLES, TIERS, ALLERGIES, PROTEINS } from "@/components/quote/types";
import { filterRecipesForSelections, pricePerGuestForRecipe, type RecipeRow } from "@/lib/quote-recipes";

export const Route = createFileRoute("/admin/quick-quote")({
  component: QuickQuotePage,
});

function QuickQuotePage() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markup, setMarkup] = useState(3.0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    clientName: "",
    clientEmail: "",
    eventType: "",
    eventDate: "",
    guestCount: 50,
    style: "mixed",
    serviceStyle: "buffet",
    tier: "silver",
    proteins: [] as string[],
    allergies: [] as string[],
    selectedRecipeIds: [] as string[],
  });

  useEffect(() => {
    (async () => {
      const [{ data: rs }, { data: settings }] = await Promise.all([
        supabase
          .from("recipes")
          .select("id,name,description,category,cuisine,cost_per_serving,is_vegetarian,is_vegan,is_gluten_free,allergens,active")
          .eq("active", true)
          .order("name"),
        supabase.from("app_settings").select("markup_multiplier").eq("id", 1).maybeSingle(),
      ]);
      setRecipes((rs as RecipeRow[]) || []);
      if (settings?.markup_multiplier) setMarkup(Number(settings.markup_multiplier));
      setLoading(false);
    })();
  }, []);

  const matched = useMemo(
    () =>
      filterRecipesForSelections(recipes, {
        style: form.style,
        proteins: form.proteins,
        allergies: form.allergies,
      }),
    [recipes, form.style, form.proteins, form.allergies],
  );

  const tier = TIERS.find((t) => t.id === form.tier) ?? TIERS[0];
  const selected = recipes.filter((r) => form.selectedRecipeIds.includes(r.id));
  const subtotal =
    selected.reduce(
      (sum, r) => sum + pricePerGuestForRecipe(r, markup, form.tier) * Math.max(form.guestCount, 1),
      0,
    );
  const total = subtotal * 1.08;
  const perGuest = form.guestCount > 0 ? subtotal / form.guestCount : 0;

  const proteinOptions = PROTEINS[form.style] || [];

  const toggleArr = (key: "proteins" | "allergies" | "selectedRecipeIds", val: string) => {
    setForm((f) => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });
  };

  const save = async () => {
    if (!form.clientName.trim()) {
      toast.error("Client name is required");
      return;
    }
    setSaving(true);
    try {
      const { data: quote, error } = await (supabase as any)
        .from("quotes")
        .insert({
          client_name: form.clientName,
          client_email: form.clientEmail || null,
          event_type: form.eventType || null,
          event_date: form.eventDate || null,
          guest_count: form.guestCount,
          dietary_preferences: {
            style: form.style,
            proteins: form.proteins,
            allergies: form.allergies,
            serviceStyle: form.serviceStyle,
            tier: form.tier,
            source: "quick_quote",
          },
          subtotal: +subtotal.toFixed(2),
          total: +total.toFixed(2),
          status: "draft",
        })
        .select("id, reference_number")
        .single();

      if (error) throw error;

      if (selected.length > 0 && quote?.id) {
        const items = selected.map((r) => {
          const unit = pricePerGuestForRecipe(r, markup, form.tier);
          return {
            quote_id: quote.id,
            recipe_id: r.id,
            name: r.name,
            quantity: form.guestCount,
            unit_price: +unit.toFixed(2),
            total_price: +(unit * form.guestCount).toFixed(2),
          };
        });
        await (supabase as any).from("quote_items").insert(items);
      }

      toast.success(`Quote created · ${quote?.reference_number ?? ""}`);
      navigate({ to: "/admin/quotes" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to save quote");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-warm flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">Quick Quote</h2>
          <p className="text-sm text-muted-foreground">
            Create a draft quote in seconds using dropdowns and matching recipes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Client & event</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Client name *</Label>
                  <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
                </div>
                <div>
                  <Label>Client email</Label>
                  <Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
                </div>
                <div>
                  <Label>Event type</Label>
                  <Input value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} placeholder="Wedding, Corporate, etc." />
                </div>
                <div>
                  <Label>Event date</Label>
                  <Input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
                </div>
                <div>
                  <Label>Guests</Label>
                  <Input type="number" min={1} value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Menu setup</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Menu style</Label>
                  <Select value={form.style} onValueChange={(v) => setForm({ ...form, style: v, proteins: [] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MENU_STYLES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.icon} {s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Service style</Label>
                  <Select value={form.serviceStyle} onValueChange={(v) => setForm({ ...form, serviceStyle: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_STYLES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.icon} {s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Service tier</Label>
                  <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIERS.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.icon} {t.label} (×{t.multiplier})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {proteinOptions.length > 0 && (
                <div>
                  <Label className="mb-2 block">Proteins</Label>
                  <div className="flex flex-wrap gap-2">
                    {proteinOptions.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleArr("proteins", p)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                          form.proteins.includes(p)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border hover:border-primary/30"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label className="mb-2 block">Allergies to avoid</Label>
                <div className="flex flex-wrap gap-2">
                  {ALLERGIES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleArr("allergies", a)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                        form.allergies.includes(a)
                          ? "bg-destructive text-destructive-foreground border-destructive"
                          : "bg-muted text-muted-foreground border-border hover:border-primary/30"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                  Matching recipes ({matched.length})
                </h3>
                <span className="text-xs text-muted-foreground">cost × {markup} markup × {tier.multiplier} tier</span>
              </div>
              {loading ? (
                <div className="flex items-center text-sm text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
              ) : matched.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No recipes match these criteria.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
                  {matched.map((r) => {
                    const isSelected = form.selectedRecipeIds.includes(r.id);
                    const price = pricePerGuestForRecipe(r, markup, form.tier);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleArr("selectedRecipeIds", r.id)}
                        className={`text-left p-3 rounded-lg border transition ${
                          isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{r.name}</p>
                            <p className="text-[11px] text-muted-foreground">{r.category || "—"} · {r.cuisine || "—"}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-semibold text-primary">${price.toFixed(2)}</span>
                            {isSelected ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Live total */}
        <div className="space-y-4">
          <Card className="sticky top-4 shadow-warm">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-display text-lg font-semibold">Quote summary</h3>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Guests</span><span>{form.guestCount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tier</span><span>{tier.icon} {tier.label}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Recipes</span><span>{selected.length}</span></div>
              </div>

              {selected.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-2">Selected</p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {selected.map((r) => (
                      <li key={r.id} className="text-xs flex justify-between gap-2">
                        <span className="truncate">{r.name}</span>
                        <span className="text-muted-foreground shrink-0">
                          ${pricePerGuestForRecipe(r, markup, form.tier).toFixed(2)}/g
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Per guest</span><span className="font-semibold">${perGuest.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tax (8%)</span><span>${(total - subtotal).toFixed(2)}</span></div>
              </div>
              <div className="border-t pt-3 flex justify-between items-baseline">
                <span className="font-semibold">Total</span>
                <span className="font-display text-2xl font-bold text-gradient-gold">${total.toFixed(2)}</span>
              </div>

              <Button onClick={save} disabled={saving || selected.length === 0} className="w-full bg-gradient-warm text-primary-foreground">
                {saving ? "Creating..." : "Create Quote"}
              </Button>
              {selected.length === 0 && (
                <p className="text-[11px] text-center text-muted-foreground">Pick at least one recipe to enable</p>
              )}
              <Badge variant="secondary" className="w-full justify-center">Saves as draft in Saved Quotes</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
