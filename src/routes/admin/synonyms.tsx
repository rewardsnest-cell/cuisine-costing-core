import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Search, Download, Upload, Sparkles, X, RefreshCw, Check, ChevronsUpDown, Link2, ListPlus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getIngredientCostMetrics } from "@/lib/recipe-costing";

export const Route = createFileRoute("/admin/synonyms")({
  head: () => ({
    meta: [
      { title: "Ingredient Synonyms — TasteQuote" },
      { name: "description", content: "Edit the alias map used by the AI counter-quote builder to match ingredients to inventory." },
    ],
  }),
  component: SynonymsPage,
});

interface SynonymRow {
  id: string;
  alias: string;
  canonical: string;
  alias_normalized: string;
}

interface Suggestion {
  alias_normalized: string;
  display: string;
  count: number;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  average_cost_per_unit: number;
}

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toTitleCase(s: string) {
  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function csvEscape(v: string) {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field !== "" || cur.length > 0) { cur.push(field); rows.push(cur); cur = []; field = ""; }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else field += c;
    }
  }
  if (field !== "" || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// --- Inventory autocomplete combobox ---
function InventoryCombobox({
  inventory,
  value,
  onChange,
  placeholder,
}: {
  inventory: InventoryItem[];
  value: string;
  onChange: (canonical: string, item?: InventoryItem) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder || "Pick inventory item…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search inventory or type custom…" />
          <CommandList>
            <CommandEmpty>
              <button
                className="text-xs text-muted-foreground px-2 py-1"
                onClick={() => setOpen(false)}
              >
                No matches — keep typed value
              </button>
            </CommandEmpty>
            <CommandGroup>
              {inventory.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.name}
                  onSelect={() => {
                    onChange(item.name, item);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === item.name ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{item.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{item.unit}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SynonymsPage() {
  const [rows, setRows] = useState<SynonymRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [newCanonical, setNewCanonical] = useState("");
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggLoading, setSuggLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aliasIndex = useMemo(() => new Set(rows.map((r) => r.alias_normalized)), [rows]);
  const inventoryByNormName = useMemo(() => {
    const m = new Map<string, InventoryItem>();
    for (const it of inventory) m.set(normalize(it.name), it);
    return m;
  }, [inventory]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("ingredient_synonyms")
      .select("id, alias, canonical, alias_normalized")
      .order("alias");
    if (error) toast.error(error.message);
    else setRows(data || []);
    setLoading(false);
  };

  const loadInventory = async () => {
    const { data, error } = await (supabase as any)
      .from("inventory_items")
      .select("id, name, unit, average_cost_per_unit")
      .order("name");
    if (!error) setInventory(data || []);
  };

  const loadSuggestions = async () => {
    setSuggLoading(true);
    const [{ data: ing, error: ingErr }, { data: dismissed }] = await Promise.all([
      (supabase as any)
        .from("recipe_ingredients")
        .select("name")
        .is("inventory_item_id", null)
        .limit(2000),
      (supabase as any).from("ingredient_synonym_dismissed").select("alias_normalized"),
    ]);

    if (ingErr) {
      toast.error(ingErr.message);
      setSuggLoading(false);
      return;
    }

    const dismissedSet = new Set<string>((dismissed || []).map((d: any) => d.alias_normalized));
    const existing = new Set(rows.map((r) => r.alias_normalized));
    const counts = new Map<string, { display: string; count: number }>();
    for (const r of (ing || []) as Array<{ name: string }>) {
      const raw = String(r.name || "").trim();
      if (!raw) continue;
      const n = normalize(raw);
      if (!n || existing.has(n) || dismissedSet.has(n)) continue;
      const cur = counts.get(n);
      if (cur) cur.count++;
      else counts.set(n, { display: raw, count: 1 });
    }
    const arr: Suggestion[] = Array.from(counts.entries())
      .map(([alias_normalized, v]) => ({ alias_normalized, display: v.display, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);
    setSuggestions(arr);
    setSuggLoading(false);
  };

  useEffect(() => {
    load();
    loadInventory();
  }, []);

  useEffect(() => {
    if (!loading) loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rows.length]);

  // ---------- Auto-relink + recompute when a synonym is added ----------
  // Finds recipe_ingredients whose normalized name matches `aliasNormalized`,
  // links them to the inventory item matching `canonical`, seeds their
  // cost_per_unit from inventory's average_cost_per_unit (using unit-aware
  // conversion when possible), then recomputes affected recipes' totals.
  const relinkAndRecompute = async (aliasNormalized: string, canonical: string) => {
    const invItem = inventoryByNormName.get(normalize(canonical));
    if (!invItem) {
      return { linked: 0, recipesUpdated: 0 };
    }

    // Pull ALL ingredients matching this alias (linked or not) so we can
    // refresh stale fallback cost_per_unit values too.
    const { data: ings, error: ingsErr } = await (supabase as any)
      .from("recipe_ingredients")
      .select("id, recipe_id, name, quantity, unit, cost_per_unit, inventory_item_id")
      .limit(10000);
    if (ingsErr) return { linked: 0, recipesUpdated: 0 };

    const matching = (ings || []).filter((r: any) => normalize(r.name) === aliasNormalized);
    if (matching.length === 0) return { linked: 0, recipesUpdated: 0 };

    const recipeIds = Array.from(new Set(matching.map((m: any) => m.recipe_id)));

    // Seed cost_per_unit from inventory using unit-aware conversion.
    // Falls back to raw avg cost when units aren't convertible.
    const avgCost = Number(invItem.average_cost_per_unit) || 0;
    let linked = 0;
    for (const m of matching as any[]) {
      const conv = getIngredientCostMetrics({
        quantity: 1,
        unit: m.unit,
        fallbackCostPerUnit: avgCost,
        inventoryItem: invItem,
      });
      const seededCost = conv.usedInventoryConversion ? conv.unitCost : avgCost;
      const { error: uErr } = await (supabase as any)
        .from("recipe_ingredients")
        .update({ inventory_item_id: invItem.id, cost_per_unit: seededCost })
        .eq("id", m.id);
      if (!uErr) linked++;
    }
    if (linked === 0) return { linked: 0, recipesUpdated: 0 };

    // Recompute affected recipes' costs
    const { data: recipesData } = await (supabase as any)
      .from("recipes")
      .select("id, servings, recipe_ingredients(id, quantity, unit, cost_per_unit, inventory_item:inventory_items(average_cost_per_unit, unit))")
      .in("id", recipeIds);

    let updated = 0;
    for (const r of (recipesData || []) as any[]) {
      const total = (r.recipe_ingredients || []).reduce(
        (sum: number, ing: any) =>
          sum +
          getIngredientCostMetrics({
            quantity: Number(ing.quantity) || 0,
            unit: ing.unit,
            fallbackCostPerUnit: ing.cost_per_unit,
            inventoryItem: ing.inventory_item,
          }).lineTotal,
        0,
      );
      const servings = Number(r.servings) || 1;
      const { error: rErr } = await (supabase as any)
        .from("recipes")
        .update({ total_cost: total, cost_per_serving: total / servings })
        .eq("id", r.id);
      if (!rErr) updated++;
    }

    return { linked: matching.length, recipesUpdated: updated };
  };

  const announceRelink = (res: { linked: number; recipesUpdated: number }) => {
    if (res.linked > 0) {
      toast.success(`Re-linked ${res.linked} ingredient${res.linked === 1 ? "" : "s"} · recomputed ${res.recipesUpdated} recipe${res.recipesUpdated === 1 ? "" : "s"}`);
    }
  };

  const addRow = async () => {
    const aliasTrim = newAlias.trim();
    const canonTrim = newCanonical.trim();
    if (!aliasTrim || !canonTrim) {
      toast.error("Both alias and canonical name are required");
      return;
    }
    setAdding(true);
    const aliasNorm = normalize(aliasTrim);
    const { error } = await (supabase as any).from("ingredient_synonyms").insert({
      alias: aliasTrim,
      canonical: canonTrim,
      alias_normalized: aliasNorm,
    });
    if (error) {
      setAdding(false);
      toast.error(error.message);
      return;
    }
    toast.success("Synonym added");
    const res = await relinkAndRecompute(aliasNorm, canonTrim);
    announceRelink(res);
    setAdding(false);
    setNewAlias("");
    setNewCanonical("");
    load();
  };

  const updateRow = (row: SynonymRow, field: "alias" | "canonical", value: string) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)));
  };

  const saveRow = async (row: SynonymRow) => {
    const aliasTrim = row.alias.trim();
    const canonTrim = row.canonical.trim();
    if (!aliasTrim || !canonTrim) { toast.error("Both fields are required"); return; }
    const aliasNorm = normalize(aliasTrim);
    const { error } = await (supabase as any)
      .from("ingredient_synonyms")
      .update({ alias: aliasTrim, canonical: canonTrim, alias_normalized: aliasNorm })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    const res = await relinkAndRecompute(aliasNorm, canonTrim);
    announceRelink(res);
    load();
  };

  const deleteRow = async (row: SynonymRow) => {
    if (!confirm(`Delete synonym "${row.alias}" → "${row.canonical}"?`)) return;
    const { error } = await (supabase as any).from("ingredient_synonyms").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const [relinkingId, setRelinkingId] = useState<string | null>(null);
  const relinkRow = async (row: SynonymRow) => {
    setRelinkingId(row.id);
    const res = await relinkAndRecompute(row.alias_normalized, row.canonical);
    setRelinkingId(null);
    if (res.linked === 0) toast.info("No matching recipe ingredients found");
    else announceRelink(res);
  };

  const [draftCanonical, setDraftCanonical] = useState<Record<string, string>>({});

  const acceptSuggestion = async (s: Suggestion) => {
    const canonical = (draftCanonical[s.alias_normalized] || toTitleCase(s.alias_normalized)).trim();
    if (!canonical) { toast.error("Pick or enter a canonical name"); return; }
    if (aliasIndex.has(s.alias_normalized)) { toast.error("Alias already exists"); return; }
    const { error } = await (supabase as any).from("ingredient_synonyms").insert({
      alias: s.display,
      canonical,
      alias_normalized: s.alias_normalized,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Added: ${s.display} → ${canonical}`);
    const res = await relinkAndRecompute(s.alias_normalized, canonical);
    announceRelink(res);
    setSuggestions((prev) => prev.filter((x) => x.alias_normalized !== s.alias_normalized));
    load();
  };

  const dismissSuggestion = async (s: Suggestion) => {
    const { error } = await (supabase as any)
      .from("ingredient_synonym_dismissed")
      .insert({ alias_normalized: s.alias_normalized });
    if (error) { toast.error(error.message); return; }
    setSuggestions((prev) => prev.filter((x) => x.alias_normalized !== s.alias_normalized));
  };

  // ---------- Bulk add (textarea) ----------
  const [bulkText, setBulkText] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);
  const handleBulkAdd = async () => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error("Paste one synonym per line");
      return;
    }
    setBulkAdding(true);
    const existing = new Map(rows.map((r) => [r.alias_normalized, r] as const));
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let totalLinked = 0;
    let totalRecipes = 0;
    for (const raw of lines) {
      // Accept "alias => canonical", "alias -> canonical", "alias = canonical", or "alias,canonical"
      const m = raw.match(/^(.+?)\s*(?:=>|->|→|=|,|\t)\s*(.+)$/);
      if (!m) { skipped++; continue; }
      const alias = m[1].trim();
      const canonical = m[2].trim();
      if (!alias || !canonical) { skipped++; continue; }
      const aliasNorm = normalize(alias);
      const ex = existing.get(aliasNorm);
      if (ex) {
        const { error } = await (supabase as any)
          .from("ingredient_synonyms")
          .update({ alias, canonical })
          .eq("id", ex.id);
        if (!error) updated++;
      } else {
        const { error } = await (supabase as any)
          .from("ingredient_synonyms")
          .insert({ alias, canonical, alias_normalized: aliasNorm });
        if (!error) added++;
      }
      const res = await relinkAndRecompute(aliasNorm, canonical);
      totalLinked += res.linked;
      totalRecipes += res.recipesUpdated;
    }
    setBulkAdding(false);
    setBulkText("");
    toast.success(
      `Bulk add: ${added} added, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}` +
        (totalLinked ? ` · re-linked ${totalLinked} ingredients in ${totalRecipes} recipes` : ""),
    );
    load();
  };

  // ---------- CSV import / export ----------
  const exportCsv = () => {
    const lines = ["alias,canonical"];
    for (const r of rows) lines.push(`${csvEscape(r.alias)},${csvEscape(r.canonical)}`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ingredient-synonyms-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) { toast.error("CSV is empty"); return; }
      const first = parsed[0].map((c) => c.trim().toLowerCase());
      const dataRows = first.includes("alias") && first.includes("canonical") ? parsed.slice(1) : parsed;

      const existing = new Map(rows.map((r) => [r.alias_normalized, r] as const));
      const upserts: Array<{ alias: string; canonical: string; alias_normalized: string }> = [];
      const skipped: string[] = [];
      for (const r of dataRows) {
        const alias = (r[0] || "").trim();
        const canonical = (r[1] || "").trim();
        if (!alias || !canonical) { skipped.push(r.join(",")); continue; }
        upserts.push({ alias, canonical, alias_normalized: normalize(alias) });
      }
      if (upserts.length === 0) { toast.error("No valid rows in CSV"); return; }

      let added = 0;
      let updated = 0;
      let totalLinked = 0;
      let totalRecipes = 0;
      for (const u of upserts) {
        const ex = existing.get(u.alias_normalized);
        if (ex) {
          const { error } = await (supabase as any)
            .from("ingredient_synonyms")
            .update({ alias: u.alias, canonical: u.canonical })
            .eq("id", ex.id);
          if (!error) updated++;
        } else {
          const { error } = await (supabase as any).from("ingredient_synonyms").insert(u);
          if (!error) added++;
        }
        const res = await relinkAndRecompute(u.alias_normalized, u.canonical);
        totalLinked += res.linked;
        totalRecipes += res.recipesUpdated;
      }
      toast.success(
        `Imported: ${added} added, ${updated} updated${skipped.length ? `, ${skipped.length} skipped` : ""}` +
          (totalLinked ? ` · re-linked ${totalLinked} ingredients in ${totalRecipes} recipes` : ""),
      );
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to import CSV");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.alias.toLowerCase().includes(q) || r.canonical.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Ingredient Synonyms</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Map common ingredient aliases to canonical inventory names. Used by the AI counter-quote builder to match ingredients
          (e.g. <span className="font-medium">EVOO → Extra Virgin Olive Oil</span>, <span className="font-medium">salt → Kosher Salt</span>).
          Adding a synonym auto-relinks matching recipe ingredients and recomputes costs.
        </p>
      </div>

      {/* Suggested Synonyms */}
      <Card className="shadow-warm border-border/50">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <p className="font-semibold">Suggested synonyms</p>
              <span className="text-xs text-muted-foreground">
                Ingredient names recently created by the AI that didn't match any inventory item.
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={loadSuggestions} disabled={suggLoading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${suggLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {suggLoading ? (
            <p className="text-sm text-muted-foreground">Scanning recent recipes…</p>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nothing to suggest — every recent ingredient is mapped.
            </p>
          ) : (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div
                  key={s.alias_normalized}
                  className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center p-2 rounded-lg bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.display}</p>
                    <p className="text-xs text-muted-foreground">used {s.count}×</p>
                  </div>
                  <InventoryCombobox
                    inventory={inventory}
                    value={draftCanonical[s.alias_normalized] ?? ""}
                    onChange={(canonical) =>
                      setDraftCanonical((prev) => ({ ...prev, [s.alias_normalized]: canonical }))
                    }
                    placeholder={`Pick inventory (e.g. ${toTitleCase(s.alias_normalized)})`}
                  />
                  <Button size="sm" className="bg-gradient-warm text-primary-foreground gap-1.5" onClick={() => acceptSuggestion(s)}>
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => dismissSuggestion(s)} title="Dismiss">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add new + CSV tools */}
      <Card className="shadow-warm border-border/50">
        <CardContent className="p-5 space-y-4">
          <div>
            <p className="font-semibold mb-3">Add a new synonym</p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <Label className="text-xs">Alias (what AI says)</Label>
                <Input value={newAlias} placeholder="e.g. EVOO" onChange={(e) => setNewAlias(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Canonical (inventory name)</Label>
                <InventoryCombobox
                  inventory={inventory}
                  value={newCanonical}
                  onChange={(c) => setNewCanonical(c)}
                  placeholder="Pick from inventory…"
                />
              </div>
              <Button onClick={addRow} disabled={adding} className="bg-gradient-warm text-primary-foreground gap-1.5">
                <Plus className="w-4 h-4" />
                {adding ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>

          <div className="border-t pt-4 flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium mr-auto">Bulk edit</p>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="gap-1.5"
            >
              <Upload className="w-4 h-4" />
              {importing ? "Importing…" : "Import CSV"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
              }}
            />
            <p className="w-full text-xs text-muted-foreground">
              CSV columns: <code>alias,canonical</code>. Rows with an existing alias are updated; new ones are inserted.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bulk add */}
      <Card className="shadow-warm border-border/50">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-primary" />
            <p className="font-semibold">Bulk add synonyms</p>
            <span className="text-xs text-muted-foreground">
              One per line. Separator can be <code>=&gt;</code>, <code>-&gt;</code>, <code>=</code>, comma, or tab.
            </span>
          </div>
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"EVOO => Extra Virgin Olive Oil\nsalt => Kosher Salt\ngarlic clove, Garlic\nmaldon = Kosher Salt"}
            rows={6}
            className="font-mono text-sm"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleBulkAdd}
              disabled={bulkAdding || !bulkText.trim()}
              className="bg-gradient-warm text-primary-foreground gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {bulkAdding ? "Adding…" : "Add all"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing synonyms */}
      <Card className="shadow-warm border-border/50">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <p className="font-semibold">
              {loading ? "Loading…" : `${filtered.length} synonym${filtered.length === 1 ? "" : "s"}`}
            </p>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search aliases or canonical names…"
                className="pl-9"
              />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No synonyms found.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-center p-2 rounded-lg hover:bg-muted/40"
                >
                  <Input value={row.alias} onChange={(e) => updateRow(row, "alias", e.target.value)} />
                  <Input value={row.canonical} onChange={(e) => updateRow(row, "canonical", e.target.value)} />
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => saveRow(row)}>
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => relinkRow(row)}
                    disabled={relinkingId === row.id}
                    title="Re-link matching recipe ingredients and recompute affected recipe costs"
                  >
                    <Link2 className={`w-3.5 h-3.5 ${relinkingId === row.id ? "animate-pulse" : ""}`} />
                    {relinkingId === row.id ? "Relinking…" : "Relink"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteRow(row)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
