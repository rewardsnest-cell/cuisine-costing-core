import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Search, Download, Upload, Sparkles, X, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

// Minimal CSV helpers (handles quoted fields + escaped quotes)
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aliasIndex = useMemo(() => new Set(rows.map((r) => r.alias_normalized)), [rows]);

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

  const loadSuggestions = async () => {
    setSuggLoading(true);
    // Pull recent unlinked ingredient names from AI-created recipes
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
  }, []);

  // Recompute suggestions whenever the synonyms list changes (e.g. after add)
  useEffect(() => {
    if (!loading) loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rows.length]);

  const addRow = async () => {
    const aliasTrim = newAlias.trim();
    const canonTrim = newCanonical.trim();
    if (!aliasTrim || !canonTrim) {
      toast.error("Both alias and canonical name are required");
      return;
    }
    setAdding(true);
    const { error } = await (supabase as any).from("ingredient_synonyms").insert({
      alias: aliasTrim,
      canonical: canonTrim,
      alias_normalized: normalize(aliasTrim),
    });
    setAdding(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewAlias("");
    setNewCanonical("");
    toast.success("Synonym added");
    load();
  };

  const updateRow = (row: SynonymRow, field: "alias" | "canonical", value: string) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)));
  };

  const saveRow = async (row: SynonymRow) => {
    const aliasTrim = row.alias.trim();
    const canonTrim = row.canonical.trim();
    if (!aliasTrim || !canonTrim) { toast.error("Both fields are required"); return; }
    const { error } = await (supabase as any)
      .from("ingredient_synonyms")
      .update({ alias: aliasTrim, canonical: canonTrim, alias_normalized: normalize(aliasTrim) })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    load();
  };

  const deleteRow = async (row: SynonymRow) => {
    if (!confirm(`Delete synonym "${row.alias}" → "${row.canonical}"?`)) return;
    const { error } = await (supabase as any).from("ingredient_synonyms").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  // ---------- Suggested synonyms actions ----------
  const [draftCanonical, setDraftCanonical] = useState<Record<string, string>>({});

  const acceptSuggestion = async (s: Suggestion) => {
    const canonical = (draftCanonical[s.alias_normalized] || toTitleCase(s.alias_normalized)).trim();
    if (!canonical) { toast.error("Enter a canonical name"); return; }
    if (aliasIndex.has(s.alias_normalized)) { toast.error("Alias already exists"); return; }
    const { error } = await (supabase as any).from("ingredient_synonyms").insert({
      alias: s.display,
      canonical,
      alias_normalized: s.alias_normalized,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Added: ${s.display} → ${canonical}`);
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
      // Drop header row if it looks like one
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

      // Upsert by alias_normalized: update existing, insert new
      let added = 0;
      let updated = 0;
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
      }
      toast.success(`Imported: ${added} added, ${updated} updated${skipped.length ? `, ${skipped.length} skipped` : ""}`);
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
                  <Input
                    placeholder={`Map to canonical (e.g. ${toTitleCase(s.alias_normalized)})`}
                    value={draftCanonical[s.alias_normalized] ?? ""}
                    onChange={(e) =>
                      setDraftCanonical((prev) => ({ ...prev, [s.alias_normalized]: e.target.value }))
                    }
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
                <Input value={newCanonical} placeholder="e.g. Extra Virgin Olive Oil" onChange={(e) => setNewCanonical(e.target.value)} />
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
                  className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center p-2 rounded-lg hover:bg-muted/40"
                >
                  <Input value={row.alias} onChange={(e) => updateRow(row, "alias", e.target.value)} />
                  <Input value={row.canonical} onChange={(e) => updateRow(row, "canonical", e.target.value)} />
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => saveRow(row)}>
                    <Save className="w-3.5 h-3.5" />
                    Save
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
