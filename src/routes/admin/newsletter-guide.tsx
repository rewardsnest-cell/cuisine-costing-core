import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Download, Save, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { generateNewsletterGuidePDF, type GuideRecipe } from "@/lib/newsletter-guide-pdf";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

interface RecipeRow {
  id: string;
  name: string;
  description: string | null;
  prep_time: number | null;
  cook_time: number | null;
  servings: number | null;
  category: string | null;
  use_case: string | null;
  active: boolean;
  instructions: string | null;
}

export const Route = createFileRoute("/admin/newsletter-guide")({
  component: NewsletterGuidePage,
});

function NewsletterGuidePage() {
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("Weeknight Recipe Guide");
  const [subtitle, setSubtitle] = useState("Five reliable recipes we cook on busy nights.");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: rs }, { data: kv }] = await Promise.all([
        (supabase as any)
          .from("recipes")
          .select("id, name, description, prep_time, cook_time, servings, category, use_case, active, instructions")
          .eq("active", true)
          .order("name"),
        (supabase as any).from("app_kv").select("value").eq("key", "newsletter_guide_pdf_url").maybeSingle(),
      ]);
      setRecipes(rs || []);
      setActiveUrl(kv?.value || null);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q));
  }, [recipes, filter]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function buildAndDownload() {
    if (selected.size === 0) {
      toast.error("Pick at least one recipe.");
      return;
    }
    setBusy(true);
    try {
      const ids = Array.from(selected);
      const picked = recipes.filter((r) => selected.has(r.id));
      const { data: ings } = await (supabase as any)
        .from("recipe_ingredients")
        .select("recipe_id, name, quantity, unit")
        .in("recipe_id", ids);
      const byRecipe = new Map<string, { name: string; quantity: number | null; unit: string | null }[]>();
      for (const i of ings || []) {
        if (!byRecipe.has(i.recipe_id)) byRecipe.set(i.recipe_id, []);
        byRecipe.get(i.recipe_id)!.push({ name: i.name, quantity: i.quantity, unit: i.unit });
      }
      const guideRecipes: GuideRecipe[] = picked.map((r) => ({
        name: r.name,
        description: r.description,
        prep_time: r.prep_time,
        cook_time: r.cook_time,
        servings: r.servings,
        instructions: r.instructions,
        ingredients: byRecipe.get(r.id) || [],
      }));
      const doc = generateNewsletterGuidePDF({ title, subtitle, recipes: guideRecipes });
      const filename = `weeknight-recipe-guide-${new Date().toISOString().slice(0, 10)}.pdf`;
      const { saveAndLogDownload } = await import("@/lib/downloads/save-download");
      const res = await saveAndLogDownload({
        blob: doc.output("blob"),
        filename,
        kind: "newsletter_guide",
        sourceLabel: title,
      });
      toast.success(res.persisted ? "PDF downloaded & saved to your account." : "PDF downloaded.");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Could not generate PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function publishToStorage() {
    if (selected.size === 0) {
      toast.error("Pick at least one recipe.");
      return;
    }
    setBusy(true);
    try {
      const ids = Array.from(selected);
      const picked = recipes.filter((r) => selected.has(r.id));
      const { data: ings } = await (supabase as any)
        .from("recipe_ingredients")
        .select("recipe_id, name, quantity, unit")
        .in("recipe_id", ids);
      const byRecipe = new Map<string, { name: string; quantity: number | null; unit: string | null }[]>();
      for (const i of ings || []) {
        if (!byRecipe.has(i.recipe_id)) byRecipe.set(i.recipe_id, []);
        byRecipe.get(i.recipe_id)!.push({ name: i.name, quantity: i.quantity, unit: i.unit });
      }
      const doc = generateNewsletterGuidePDF({
        title,
        subtitle,
        recipes: picked.map((r) => ({
          name: r.name,
          description: r.description,
          prep_time: r.prep_time,
          cook_time: r.cook_time,
          servings: r.servings,
          instructions: r.instructions,
          ingredients: byRecipe.get(r.id) || [],
        })),
      });
      const blob = doc.output("blob");
      const path = `newsletter-guide/weeknight-recipe-guide-${Date.now()}.pdf`;
      const { error: upErr } = await (supabase as any).storage
        .from("site-assets")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = (supabase as any).storage.from("site-assets").getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error("No public URL returned.");

      // Persist into app_kv (used by NewsletterSignup)
      const { error: kvErr } = await (supabase as any)
        .from("app_kv")
        .upsert({ key: "newsletter_guide_pdf_url", value: url }, { onConflict: "key" });
      if (kvErr) throw kvErr;

      // Also remember the title/subtitle/recipe selection for reference
      await (supabase as any).from("app_kv").upsert(
        {
          key: "newsletter_guide_meta",
          value: JSON.stringify({ title, subtitle, recipe_ids: ids, published_at: new Date().toISOString() }),
        },
        { onConflict: "key" },
      );

      setActiveUrl(url);
      toast.success("Published — public download URL is now live.");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Could not publish guide.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHelpCard route="/admin/newsletter-guide" />
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Newsletter Recipe Guide</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Pick recipes, generate the branded PDF, and publish it as the active "Free Weeknight Recipe Guide" download.
        </p>
      </div>

      {activeUrl && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span>An active guide is live and shown to subscribers.</span>
            </div>
            <a href={activeUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Open current PDF
            </a>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-warm">
        <CardContent className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">PDF title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            </div>
            <div>
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input id="subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={140} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={buildAndDownload} disabled={busy || selected.size === 0} variant="outline" className="gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Preview / Download
            </Button>
            <Button onClick={publishToStorage} disabled={busy || selected.size === 0} className="gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Publish as active guide
            </Button>
            <span className="text-xs text-muted-foreground">{selected.size} recipe(s) selected</span>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-warm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="font-display text-lg font-semibold">Pick recipes</h3>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name or category…"
              className="ml-auto max-w-xs"
            />
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading recipes…</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
              {filtered.map((r) => {
                const checked = selected.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggle(r.id)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox checked={checked} className="mt-0.5 pointer-events-none" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{r.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[r.category, r.use_case].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No matches.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
