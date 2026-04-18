import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { scanVpsfinestRecipes, importVpsfinestRecipes } from "@/lib/server/import-vpsfinest-recipes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/import-recipes")({
  head: () => ({ meta: [{ title: "Import Recipes from vpsfinest.com — Admin" }] }),
  component: ImportRecipesPage,
});

type Recipe = Awaited<ReturnType<typeof scanVpsfinestRecipes>>["recipes"][number];

function ImportRecipesPage() {
  const scan = useServerFn(scanVpsfinestRecipes);
  const importFn = useServerFn(importVpsfinestRecipes);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<{ url: string; error: string }[]>([]);
  const [stats, setStats] = useState<{ totalLinks: number; candidateLinks: number } | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setRecipes([]);
    setSelected(new Set());
    setErrors([]);
    try {
      const res = await scan();
      setRecipes(res.recipes);
      setSelected(new Set(res.recipes.map((_, i) => i)));
      setErrors(res.errors);
      setStats({ totalLinks: res.totalLinks, candidateLinks: res.candidateLinks });
      toast.success(`Found ${res.recipes.length} recipes`);
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleImport = async () => {
    const picks = recipes.filter((_, i) => selected.has(i));
    if (!picks.length) { toast.error("Select at least one recipe"); return; }
    setImporting(true);
    try {
      const res = await importFn({ data: { recipes: picks } });
      toast.success(`Imported ${res.inserted.length}, skipped ${res.skipped.length}`);
      if (res.skipped.length) console.log("Skipped:", res.skipped);
      setRecipes((prev) => prev.filter((r) => !res.inserted.find((i) => i.name === r.name)));
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const toggle = (i: number) => {
    setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };

  const updateName = (i: number, name: string) => {
    setRecipes((prev) => prev.map((r, idx) => idx === i ? { ...r, name } : r));
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="font-display text-2xl font-bold">Import Recipes from vpsfinest.com</h2>
        <p className="text-sm text-muted-foreground">Scrape recipe pages from the public site and import them into your catalog.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Step 1 — Scan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleScan} disabled={scanning} className="bg-gradient-warm text-primary-foreground">
            {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            {scanning ? "Scanning (this can take a couple of minutes)..." : "Scan vpsfinest.com"}
          </Button>
          {stats && (
            <p className="text-xs text-muted-foreground">
              {stats.totalLinks} total links · {stats.candidateLinks} recipe candidates · {recipes.length} parsed · {errors.length} errors
            </p>
          )}
        </CardContent>
      </Card>

      {recipes.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Step 2 — Review & Import ({selected.size}/{recipes.length} selected)</CardTitle>
            <Button onClick={handleImport} disabled={importing || !selected.size} className="bg-gradient-warm text-primary-foreground">
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Import Selected
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size === recipes.length}
                      onCheckedChange={(v) => setSelected(v ? new Set(recipes.map((_, i) => i)) : new Set())}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Ingredients</TableHead>
                  <TableHead className="text-right">Servings</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipes.map((r, i) => (
                  <TableRow key={r.source_url}>
                    <TableCell><Checkbox checked={selected.has(i)} onCheckedChange={() => toggle(i)} /></TableCell>
                    <TableCell><Input value={r.name} onChange={(e) => updateName(i, e.target.value)} className="h-8" /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.category || "—"}</TableCell>
                    <TableCell className="text-right">{r.ingredients.length}</TableCell>
                    <TableCell className="text-right">{r.servings || "—"}</TableCell>
                    <TableCell><a href={r.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate block max-w-[200px]">{r.source_url.replace("https://www.vpsfinest.com", "")}</a></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {errors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-destructive">Errors ({errors.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-xs space-y-1 text-muted-foreground">
              {errors.map((e, i) => <li key={i}><span className="font-mono">{e.url}</span>: {e.error}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
