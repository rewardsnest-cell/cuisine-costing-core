import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Search } from "lucide-react";
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

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function SynonymsPage() {
  const [rows, setRows] = useState<SynonymRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [newCanonical, setNewCanonical] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("ingredient_synonyms")
      .select("id, alias, canonical, alias_normalized")
      .order("alias");
    if (error) {
      toast.error(error.message);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

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

  const updateRow = async (row: SynonymRow, field: "alias" | "canonical", value: string) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)));
  };

  const saveRow = async (row: SynonymRow) => {
    const aliasTrim = row.alias.trim();
    const canonTrim = row.canonical.trim();
    if (!aliasTrim || !canonTrim) {
      toast.error("Both fields are required");
      return;
    }
    const { error } = await (supabase as any)
      .from("ingredient_synonyms")
      .update({
        alias: aliasTrim,
        canonical: canonTrim,
        alias_normalized: normalize(aliasTrim),
      })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    load();
  };

  const deleteRow = async (row: SynonymRow) => {
    if (!confirm(`Delete synonym "${row.alias}" → "${row.canonical}"?`)) return;
    const { error } = await (supabase as any).from("ingredient_synonyms").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    setRows((prev) => prev.filter((r) => r.id !== row.id));
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

      <Card className="shadow-warm border-border/50">
        <CardContent className="p-5">
          <p className="font-semibold mb-3">Add a new synonym</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-xs">Alias (what AI says)</Label>
              <Input
                value={newAlias}
                placeholder="e.g. EVOO"
                onChange={(e) => setNewAlias(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Canonical (inventory name)</Label>
              <Input
                value={newCanonical}
                placeholder="e.g. Extra Virgin Olive Oil"
                onChange={(e) => setNewCanonical(e.target.value)}
              />
            </div>
            <Button onClick={addRow} disabled={adding} className="bg-gradient-warm text-primary-foreground gap-1.5">
              <Plus className="w-4 h-4" />
              {adding ? "Adding…" : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

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
                  <Input
                    value={row.alias}
                    onChange={(e) => updateRow(row, "alias", e.target.value)}
                  />
                  <Input
                    value={row.canonical}
                    onChange={(e) => updateRow(row, "canonical", e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => saveRow(row)}
                  >
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
