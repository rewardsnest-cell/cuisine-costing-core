import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, ArrowLeft, Link2, Plus, X, RefreshCw, CheckCircle2, Loader2, PackagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const COMMON_UNITS = ["each", "lb", "oz", "g", "kg", "ml", "l", "cup", "tbsp", "tsp", "clove", "bunch", "head", "slice", "piece"];

export const Route = createFileRoute("/admin/auto-link-ingredients")({
  head: () => ({
    meta: [
      { title: "Auto-Link Ingredients — TasteQuote" },
      { name: "description", content: "Suggest inventory matches for unlinked recipe ingredients using fuzzy matching." },
    ],
  }),
  component: AutoLink,
});

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

interface Match {
  inventory_item_id: string;
  inventory_name: string;
  inventory_unit: string;
  similarity: number;
  source: string;
}

interface UnlinkedGroup {
  alias: string;
  alias_normalized: string;
  count: number;
  ingredient_ids: string[];
  matches: Match[];
  loadingMatches: boolean;
  selected: string | null; // inventory_item_id
  done: boolean;
  dismissed: boolean;
  busy: boolean;
  showAddForm: boolean;
  newName: string;
  newUnit: string;
  newCost: string;
}

function AutoLink() {
  const [groups, setGroups] = useState<UnlinkedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    // Fetch all unlinked ingredients, group by normalized name
    const { data: ings } = await supabase
      .from("recipe_ingredients")
      .select("id, name")
      .is("inventory_item_id", null);

    const { data: dismissed } = await (supabase as any)
      .from("ingredient_synonym_dismissed")
      .select("alias_normalized");
    const dismissedSet = new Set<string>((dismissed || []).map((d: any) => d.alias_normalized));

    const byNorm = new Map<string, UnlinkedGroup>();
    for (const i of ings || []) {
      const norm = normalize(i.name);
      if (!norm) continue;
      const g: UnlinkedGroup = byNorm.get(norm) || {
        alias: i.name,
        alias_normalized: norm,
        count: 0,
        ingredient_ids: [],
        matches: [],
        loadingMatches: false,
        selected: null,
        done: false,
        dismissed: dismissedSet.has(norm),
        busy: false,
        showAddForm: false,
        newName: i.name,
        newUnit: "each",
        newCost: "",
      };
      g.count += 1;
      g.ingredient_ids.push(i.id);
      byNorm.set(norm, g);
    }

    const arr = Array.from(byNorm.values()).sort((a, b) => b.count - a.count);
    setGroups(arr);
    setLoading(false);

    // Kick off matching in batches of 5
    const visible = arr.filter((g) => !g.dismissed);
    for (let i = 0; i < visible.length; i += 5) {
      const batch = visible.slice(i, i + 5);
      await Promise.all(batch.map((g) => fetchMatches(g.alias_normalized, g.alias)));
    }
  };

  const fetchMatches = async (norm: string, alias: string) => {
    setGroups((prev) => prev.map((g) => (g.alias_normalized === norm ? { ...g, loadingMatches: true } : g)));
    const { data, error } = await (supabase as any).rpc("find_ingredient_matches", { _name: alias, _limit: 4 });
    if (error) {
      setGroups((prev) => prev.map((g) => (g.alias_normalized === norm ? { ...g, loadingMatches: false } : g)));
      return;
    }
    const matches = (data || []) as Match[];
    setGroups((prev) =>
      prev.map((g) =>
        g.alias_normalized === norm
          ? {
              ...g,
              matches,
              loadingMatches: false,
              selected: g.selected || (matches[0] && matches[0].similarity >= 0.55 ? matches[0].inventory_item_id : null),
            }
          : g
      )
    );
  };

  useEffect(() => { load(); }, []);

  const linkGroup = async (norm: string) => {
    const g = groups.find((x) => x.alias_normalized === norm);
    if (!g || !g.selected) return;
    const inv = g.matches.find((m) => m.inventory_item_id === g.selected);
    if (!inv) return;

    setGroups((prev) => prev.map((x) => (x.alias_normalized === norm ? { ...x, busy: true } : x)));

    // 1. Link every recipe_ingredient row with this name to the chosen inventory item
    const { error: linkErr } = await supabase
      .from("recipe_ingredients")
      .update({ inventory_item_id: g.selected })
      .in("id", g.ingredient_ids);

    if (linkErr) {
      toast.error(linkErr.message);
      setGroups((prev) => prev.map((x) => (x.alias_normalized === norm ? { ...x, busy: false } : x)));
      return;
    }

    // 2. Record the synonym so future imports auto-resolve (idempotent on alias_normalized)
    const canonical = inv.inventory_name;
    const { error: synErr } = await (supabase as any)
      .from("ingredient_synonyms")
      .upsert(
        { alias: g.alias, alias_normalized: norm, canonical },
        { onConflict: "alias_normalized" }
      );
    if (synErr) {
      // not fatal — link still succeeded
      console.warn("synonym upsert failed:", synErr.message);
    }

    toast.success(`Linked ${g.count} ingredient${g.count > 1 ? "s" : ""} to ${canonical}`);
    setGroups((prev) => prev.map((x) => (x.alias_normalized === norm ? { ...x, busy: false, done: true } : x)));
  };

  const updateGroup = (norm: string, patch: Partial<UnlinkedGroup>) =>
    setGroups((prev) => prev.map((x) => (x.alias_normalized === norm ? { ...x, ...patch } : x)));

  const createInventoryAndLink = async (norm: string) => {
    const g = groups.find((x) => x.alias_normalized === norm);
    if (!g) return;
    const name = g.newName.trim();
    if (!name) { toast.error("Name is required"); return; }
    const cost = parseFloat(g.newCost);

    updateGroup(norm, { busy: true });

    const { data: invItem, error: invErr } = await supabase
      .from("inventory_items")
      .insert({
        name,
        unit: g.newUnit || "each",
        average_cost_per_unit: isNaN(cost) ? 0 : cost,
        last_receipt_cost: isNaN(cost) ? null : cost,
      })
      .select("id, name")
      .single();
    if (invErr || !invItem) {
      toast.error(invErr?.message || "Failed to create inventory item");
      updateGroup(norm, { busy: false });
      return;
    }

    const { error: linkErr } = await supabase
      .from("recipe_ingredients")
      .update({ inventory_item_id: invItem.id })
      .in("id", g.ingredient_ids);
    if (linkErr) {
      toast.error(linkErr.message);
      updateGroup(norm, { busy: false });
      return;
    }

    const { error: synErr } = await (supabase as any)
      .from("ingredient_synonyms")
      .upsert(
        { alias: g.alias, alias_normalized: norm, canonical: invItem.name },
        { onConflict: "alias_normalized" }
      );
    if (synErr) console.warn("synonym upsert failed:", synErr.message);

    toast.success(`Created "${invItem.name}" and linked ${g.count} ingredient${g.count > 1 ? "s" : ""}`);
    updateGroup(norm, { busy: false, done: true });
  };

  const dismissGroup = async (norm: string) => {
    const g = groups.find((x) => x.alias_normalized === norm);
    if (!g) return;
    const { error } = await (supabase as any)
      .from("ingredient_synonym_dismissed")
      .insert({ alias_normalized: norm });
    if (error) { toast.error(error.message); return; }
    setGroups((prev) => prev.map((x) => (x.alias_normalized === norm ? { ...x, dismissed: true } : x)));
    toast.success("Dismissed");
  };

  const linkAllConfident = async () => {
    setBulkBusy(true);
    const candidates = groups.filter(
      (g) => !g.done && !g.dismissed && g.selected && g.matches[0] && g.matches[0].similarity >= 0.7
    );
    let count = 0;
    for (const g of candidates) {
      await linkGroup(g.alias_normalized);
      count += g.count;
    }
    setBulkBusy(false);
    toast.success(`Bulk linked ${candidates.length} groups (${count} ingredient rows)`);
  };

  const visibleGroups = groups.filter((g) => !g.dismissed && !g.done);
  const totalUnlinked = visibleGroups.reduce((sum, g) => sum + g.count, 0);
  const confidentCount = visibleGroups.filter(
    (g) => g.matches[0] && g.matches[0].similarity >= 0.7
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Button>
        </Link>
      </div>

      <Card className="shadow-warm border-primary/30 bg-primary/5">
        <CardContent className="p-5 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-display text-lg font-semibold mb-1">Auto-link unlinked ingredients</h2>
            <p className="text-sm text-muted-foreground">
              {totalUnlinked} recipe ingredient row{totalUnlinked === 1 ? "" : "s"} aren't linked to inventory across {visibleGroups.length} unique name{visibleGroups.length === 1 ? "" : "s"}.
              We use fuzzy matching against your inventory to suggest links. Confirm or pick another match — confirming also adds a synonym so future imports auto-resolve.
            </p>
          </div>
          <Button
            onClick={linkAllConfident}
            disabled={bulkBusy || confidentCount === 0}
            className="bg-gradient-warm text-primary-foreground gap-1.5 flex-shrink-0"
          >
            {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Auto-link {confidentCount} confident
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : visibleGroups.length === 0 ? (
        <Card className="shadow-warm border-success/40 bg-success/5">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
            <p className="font-semibold">Nothing to link.</p>
            <p className="text-sm text-muted-foreground mt-1">All ingredients are linked or dismissed.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleGroups.map((g) => {
            const top = g.matches[0];
            const confidence = top ? top.similarity : 0;
            const confidenceLabel =
              confidence >= 0.85 ? "High" : confidence >= 0.55 ? "Medium" : confidence > 0 ? "Low" : "None";
            const confidenceColor =
              confidence >= 0.85
                ? "bg-success/15 text-success border-success/30"
                : confidence >= 0.55
                ? "bg-warning/15 text-warning border-warning/30"
                : "bg-muted text-muted-foreground border-border";
            return (
              <Card key={g.alias_normalized} className="shadow-warm border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div>
                      <p className="font-semibold">{g.alias}</p>
                      <p className="text-xs text-muted-foreground">
                        Used in {g.count} ingredient row{g.count > 1 ? "s" : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={`ml-auto ${confidenceColor} font-mono text-[10px]`}>
                      {confidenceLabel} {confidence > 0 ? `(${Math.round(confidence * 100)}%)` : ""}
                    </Badge>
                  </div>

                  {g.loadingMatches ? (
                    <p className="text-xs text-muted-foreground">Searching…</p>
                  ) : g.matches.length === 0 ? (
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-2">No inventory match found.</p>
                      <Link to="/admin/inventory">
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                          <Plus className="w-3 h-3" /> Add to Inventory
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {g.matches.map((m) => (
                        <label
                          key={m.inventory_item_id}
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                            g.selected === m.inventory_item_id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/30"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`match-${g.alias_normalized}`}
                            checked={g.selected === m.inventory_item_id}
                            onChange={() =>
                              setGroups((prev) =>
                                prev.map((x) =>
                                  x.alias_normalized === g.alias_normalized
                                    ? { ...x, selected: m.inventory_item_id }
                                    : x
                                )
                              )
                            }
                            className="accent-primary"
                          />
                          <span className="text-sm flex-1">{m.inventory_name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {m.source} · {Math.round(m.similarity * 100)}%
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    <Button
                      size="sm"
                      onClick={() => linkGroup(g.alias_normalized)}
                      disabled={!g.selected || g.busy}
                      className="bg-gradient-warm text-primary-foreground gap-1.5 flex-1"
                    >
                      {g.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Link & save synonym
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => fetchMatches(g.alias_normalized, g.alias)}
                      title="Refresh matches"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismissGroup(g.alias_normalized)}
                      title="Dismiss — don't suggest again"
                    >
                      <X className="w-3.5 h-3.5" />
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
