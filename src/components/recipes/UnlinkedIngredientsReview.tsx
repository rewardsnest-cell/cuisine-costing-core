import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Link2, Check, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Unlinked = {
  id: string;
  name: string;
  unit: string;
  recipe_id: string;
  recipe?: { id: string; name: string } | null;
};

type InvItem = { id: string; name: string; unit: string; average_cost_per_unit: number };

// ---- Fuzzy match (mirrors edge function) ----
function norm(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function trigrams(s: string): Set<string> {
  const padded = `  ${norm(s)} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}
function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}
function similarity(a: string, b: string): number {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;
  const tri = trigramSimilarity(na, nb);
  const lev = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
  return tri * 0.6 + lev * 0.4;
}
function topMatches(name: string, inventory: InvItem[], n = 3) {
  return inventory
    .map((inv) => ({ inv, score: similarity(name, inv.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .filter((m) => m.score > 0.2);
}
// ---------------------------------------------

export function UnlinkedIngredientsReview() {
  const [open, setOpen] = useState(false);
  const [unlinked, setUnlinked] = useState<Unlinked[]>([]);
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickFor, setPickFor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: ings }, { data: inv }] = await Promise.all([
      (supabase as any)
        .from("recipe_ingredients")
        .select("id,name,unit,recipe_id,recipe:recipes(id,name)")
        .is("inventory_item_id", null)
        .order("name"),
      supabase
        .from("inventory_items")
        .select("id,name,unit,average_cost_per_unit")
        .order("name"),
    ]);
    setUnlinked((ings ?? []) as Unlinked[]);
    setInventory((inv ?? []) as InvItem[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const suggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof topMatches>>();
    for (const ing of unlinked) map.set(ing.id, topMatches(ing.name, inventory));
    return map;
  }, [unlinked, inventory]);

  const linkTo = async (ingId: string, invId: string | null) => {
    if (!invId) return;
    setBusy(ingId);
    const inv = inventory.find((i) => i.id === invId);
    const patch: any = { inventory_item_id: invId };
    if (inv && inv.average_cost_per_unit > 0) patch.cost_per_unit = inv.average_cost_per_unit;
    const { error } = await (supabase as any).from("recipe_ingredients").update(patch).eq("id", ingId);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Linked to inventory");
    setUnlinked((rows) => rows.filter((r) => r.id !== ingId));
  };

  const addToInventory = async (ing: Unlinked) => {
    setBusy(ing.id);
    const { data: newItem, error: invErr } = await (supabase as any)
      .from("inventory_items")
      .insert({
        name: ing.name,
        unit: ing.unit || "each",
        current_stock: 0,
        par_level: 0,
        average_cost_per_unit: 0,
      })
      .select("id,name,unit,average_cost_per_unit")
      .single();
    if (invErr || !newItem) {
      setBusy(null);
      toast.error(invErr?.message || "Failed to create inventory item");
      return;
    }
    const { error: linkErr } = await (supabase as any)
      .from("recipe_ingredients")
      .update({ inventory_item_id: newItem.id })
      .eq("id", ing.id);
    setBusy(null);
    if (linkErr) {
      toast.error(linkErr.message);
      return;
    }
    toast.success(`Added "${ing.name}" to inventory`);
    setInventory((prev) => [...prev, newItem as InvItem].sort((a, b) => a.name.localeCompare(b.name)));
    setUnlinked((rows) => rows.filter((r) => r.id !== ing.id));
  };

  if (!loading && unlinked.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700" />
            Unlinked ingredients
            <Badge variant="outline" className="ml-1">{unlinked.length}</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} className="gap-1.5">
            {open ? <><ChevronUp className="w-4 h-4" />Hide</> : <><ChevronDown className="w-4 h-4" />Review</>}
          </Button>
        </div>
        {!open && (
          <p className="text-xs text-muted-foreground">
            AI-generated ingredients that aren't linked to any inventory item. Linking them improves recipe cost accuracy.
          </p>
        )}
      </CardHeader>
      {open && (
        <CardContent className="pt-0 space-y-2 max-h-[420px] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : (
            unlinked.map((ing) => {
              const matches = suggestions.get(ing.id) ?? [];
              const top = matches[0];
              const picked = pickFor[ing.id] ?? top?.inv.id ?? "";
              return (
                <div
                  key={ing.id}
                  className="flex items-center gap-3 flex-wrap rounded-md border border-border/60 bg-background/80 p-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{ing.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {ing.recipe?.name ?? "—"} · {ing.unit}
                    </div>
                  </div>
                  {top && (
                    <Badge variant="secondary" className="text-[10px]">
                      best: {top.inv.name} ({Math.round(top.score * 100)}%)
                    </Badge>
                  )}
                  <Select
                    value={picked}
                    onValueChange={(v) => setPickFor((p) => ({ ...p, [ing.id]: v }))}
                  >
                    <SelectTrigger className="h-8 w-[220px] text-xs">
                      <SelectValue placeholder="Pick inventory item…" />
                    </SelectTrigger>
                    <SelectContent>
                      {matches.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Suggested</div>
                          {matches.map((m) => (
                            <SelectItem key={`s-${m.inv.id}`} value={m.inv.id}>
                              {m.inv.name} · {Math.round(m.score * 100)}%
                            </SelectItem>
                          ))}
                          <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">All</div>
                        </>
                      )}
                      {inventory.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>{inv.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => linkTo(ing.id, picked)}
                    disabled={!picked || busy === ing.id}
                  >
                    {busy === ing.id ? <Link2 className="w-3.5 h-3.5 animate-pulse" /> : <Check className="w-3.5 h-3.5" />}
                    Link
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      )}
    </Card>
  );
}
