import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Trash2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { parseYouTubeId, youtubeEmbedUrl } from "@/lib/recipe-video";
import { RecipeForm, type RecipeFormInitial } from "@/components/recipes/RecipeForm";
import { PricingHealthPanel } from "@/components/admin/PricingHealthPanel";

function buildAmazonUrl(query: string, tag: string | null) {
  const base = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
  return tag ? `${base}&tag=${encodeURIComponent(tag)}` : base;
}

const tabSchema = z.object({ tab: z.enum(["content", "recipe"]).optional() });

export const Route = createFileRoute("/admin/recipe-hub/$id")({
  head: () => ({ meta: [{ title: "Edit recipe — Admin" }] }),
  validateSearch: zodValidator(tabSchema),
  component: HubEdit,
});

type ShopItem = { id?: string; name: string; benefit: string; url: string; image_url: string; is_affiliate: boolean; position: number; _new?: boolean; _delete?: boolean };

function HubEdit() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const activeTab = tab ?? "content";

  const [loading, setLoading] = useState(true);
  const [r, setR] = useState<any>(null);
  const [recipeInitial, setRecipeInitial] = useState<RecipeFormInitial | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: rec }, { data: ings }] = await Promise.all([
        (supabase as any).from("recipes").select("*").eq("id", id).maybeSingle(),
        (supabase as any).from("recipe_ingredients").select("*").eq("recipe_id", id).order("name"),
      ]);
      setR(rec || null);
      if (rec) {
        setRecipeInitial({
          recipe: {
            id: rec.id,
            name: rec.name ?? "",
            description: rec.description ?? "",
            category: rec.category ?? "",
            cuisine: rec.cuisine ?? "",
            servings: String(rec.servings ?? 4),
            prep_time: rec.prep_time != null ? String(rec.prep_time) : "",
            cook_time: rec.cook_time != null ? String(rec.cook_time) : "",
            instructions: rec.instructions ?? "",
            is_vegetarian: !!rec.is_vegetarian,
            is_vegan: !!rec.is_vegan,
            is_gluten_free: !!rec.is_gluten_free,
            allergens: (rec.allergens ?? []).join(", "),
            pricing_status: rec.pricing_status ?? "valid",
            pricing_errors: Array.isArray(rec.pricing_errors) ? rec.pricing_errors : [],
            status: (rec.status as "draft" | "published") ?? "draft",
            ingredient_integrity: (rec.ingredient_integrity as "ok" | "needs_cleanup") ?? "ok",
            inspired: !!rec.inspired,
          },
          ingredients: (ings ?? []).map((i: any) => ({
            id: i.id,
            name: i.name ?? "",
            quantity: i.quantity != null ? String(i.quantity) : "",
            unit: i.unit ?? "",
            cost_per_unit: i.cost_per_unit != null ? String(i.cost_per_unit) : "",
            notes: i.notes ?? "",
            inventory_item_id: i.inventory_item_id ?? null,
            reference_id: i.reference_id ?? null,
          })),
        });
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!r) return <div className="p-6">Not found. <Link to="/admin/recipe-hub" className="underline">Back</Link></div>;

  const setTab = (t: "content" | "recipe") => navigate({ to: "/admin/recipe-hub/$id", params: { id }, search: { tab: t } });

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link to="/admin/recipe-hub" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="w-4 h-4 mr-1" />Back to recipes
        </Link>
        <div className="text-sm text-muted-foreground">{r.name}</div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as "content" | "recipe")}>
        <TabsList>
          <TabsTrigger value="content">Content & Monetization</TabsTrigger>
          <TabsTrigger value="recipe">Recipe & Cost</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <ContentEditor id={id} initial={r} />
        </TabsContent>

        <TabsContent value="recipe">
          <div className="space-y-4">
            <PricingHealthPanel recipeId={id} />
            {recipeInitial ? (
              <RecipeForm mode="edit" initial={recipeInitial} recipeId={id} />
            ) : (
              <p className="text-muted-foreground p-6">Loading recipe…</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContentEditor({ id, initial }: { id: string; initial: any }) {
  const router = useRouter();
  const [r, setR] = useState<any>(initial);
  const [tips, setTips] = useState<string[]>(Array.isArray(initial?.pro_tips) ? initial.pro_tips : []);
  const [shop, setShop] = useState<ShopItem[]>([]);
  const [shopLoaded, setShopLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: items } = await (supabase as any).from("recipe_shop_items").select("*").eq("recipe_id", id).order("position");
      setShop((items || []).map((i: any) => ({ ...i })));
      setShopLoaded(true);
    })();
  }, [id]);

  async function save() {
    setSaving(true);
    try {
      const cleanTips = tips.map((t) => t.trim()).filter(Boolean);
      const { error: upErr } = await (supabase as any)
        .from("recipes")
        .update({
          hook: r.hook || null,
          video_url: r.video_url || null,
          video_embed_html: r.video_embed_html || null,
          skill_level: r.skill_level || null,
          use_case: r.use_case || null,
          pro_tips: cleanTips,
          serving_suggestions: r.serving_suggestions || null,
          storage_instructions: r.storage_instructions || null,
          reheating_instructions: r.reheating_instructions || null,
          cta_type: r.cta_type || null,
          score_affiliate: r.score_affiliate ?? 0,
          score_video: r.score_video ?? 0,
          score_event: r.score_event ?? 0,
          score_seasonal: r.score_seasonal ?? 0,
        })
        .eq("id", id);
      if (upErr) throw upErr;

      const toDelete = shop.filter((s) => s.id && s._delete);
      const toUpdate = shop.filter((s) => s.id && !s._delete && !s._new);
      const toInsert = shop.filter((s) => !s.id && !s._delete && s.name.trim());

      if (toDelete.length) {
        const { error } = await (supabase as any).from("recipe_shop_items").delete().in("id", toDelete.map((d) => d.id));
        if (error) throw error;
      }
      for (const s of toUpdate) {
        const { error } = await (supabase as any)
          .from("recipe_shop_items")
          .update({ name: s.name, benefit: s.benefit || null, url: s.url || null, image_url: s.image_url || null, is_affiliate: s.is_affiliate, position: s.position })
          .eq("id", s.id);
        if (error) throw error;
      }
      if (toInsert.length) {
        const { error } = await (supabase as any).from("recipe_shop_items").insert(
          toInsert.map((s, i) => ({
            recipe_id: id,
            name: s.name,
            benefit: s.benefit || null,
            url: s.url || null,
            image_url: s.image_url || null,
            is_affiliate: s.is_affiliate,
            position: s.position ?? i,
          })),
        );
        if (error) throw error;
      }

      toast.success("Saved");
      router.invalidate();
      const { data: items } = await (supabase as any).from("recipe_shop_items").select("*").eq("recipe_id", id).order("position");
      setShop((items || []).map((i: any) => ({ ...i })));
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function updateShop(i: number, patch: Partial<ShopItem>) {
    setShop(shop.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  async function generateAmazonItems() {
    setGenerating(true);
    try {
      const [{ data: prog }, { data: ings }] = await Promise.all([
        (supabase as any)
          .from("affiliate_programs")
          .select("affiliate_id, status, name")
          .ilike("name", "%amazon%")
          .eq("status", "active")
          .maybeSingle(),
        (supabase as any).from("recipe_ingredients").select("name").eq("recipe_id", id),
      ]);

      const tag: string | null = prog?.affiliate_id || null;
      if (!tag) toast.warning("No active Amazon program with an affiliate tag found. Links will be untagged.");

      const list: { name: string }[] = ings || [];
      if (list.length === 0) {
        toast.error("This recipe has no ingredients yet — add them in the Recipe & Cost tab first.");
        return;
      }

      const existing = new Set(shop.filter((s) => !s._delete).map((s) => s.name.trim().toLowerCase()));
      const seen = new Set<string>();
      const additions: ShopItem[] = [];
      let pos = shop.length;

      for (const ing of list) {
        const raw = (ing.name || "").trim();
        if (!raw) continue;
        const key = raw.toLowerCase();
        if (seen.has(key) || existing.has(key)) continue;
        seen.add(key);
        additions.push({
          name: raw.replace(/\b\w/g, (c) => c.toUpperCase()),
          benefit: `Quality ${raw.toLowerCase()} for this recipe`,
          url: buildAmazonUrl(raw, tag),
          image_url: "",
          is_affiliate: true,
          position: pos++,
          _new: true,
        });
      }

      if (additions.length === 0) {
        toast.info("All ingredients already have shop items.");
        return;
      }
      setShop([...shop, ...additions]);
      toast.success(`Added ${additions.length} Amazon item${additions.length === 1 ? "" : "s"}. Review & save.`);
    } catch (e: any) {
      toast.error(e.message || "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  const embed = youtubeEmbedUrl(r.video_url);

  return (
    <div className="space-y-6 pt-4">
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? "Saving…" : "Save changes"}</Button>
      </div>

      <Card><CardContent className="p-5 space-y-3">
        <h2 className="font-semibold">Hero hook</h2>
        <Label>One-sentence hook (flavor + use case)</Label>
        <Input value={r.hook || ""} onChange={(e) => setR({ ...r, hook: e.target.value })} placeholder="Smoky brisket sliders that disappear at every backyard party." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Skill level</Label>
            <Input value={r.skill_level || ""} onChange={(e) => setR({ ...r, skill_level: e.target.value })} placeholder="Easy / Intermediate / Advanced" />
          </div>
          <div>
            <Label>Best use case</Label>
            <Input value={r.use_case || ""} onChange={(e) => setR({ ...r, use_case: e.target.value })} placeholder="Home, Party, Wedding, Catering" />
          </div>
          <div>
            <Label>Lead CTA</Label>
            <select value={r.cta_type || ""} onChange={(e) => setR({ ...r, cta_type: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Newsletter (default)</option>
              <option value="menu">View catering menu</option>
              <option value="quote">Request a quote</option>
            </select>
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-5 space-y-3">
        <h2 className="font-semibold">Video</h2>
        <Label>YouTube URL</Label>
        <Input value={r.video_url || ""} onChange={(e) => setR({ ...r, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
        {embed && <div className="aspect-video rounded-lg overflow-hidden bg-black max-w-md"><iframe src={embed} className="w-full h-full" allowFullScreen /></div>}
        <Label>Or self-hosted embed HTML (Vimeo, Mux, etc.)</Label>
        <Textarea rows={3} value={r.video_embed_html || ""} onChange={(e) => setR({ ...r, video_embed_html: e.target.value })} placeholder="<iframe src='https://player.vimeo.com/video/...' />" />
        {r.video_url && !parseYouTubeId(r.video_url) && (
          <p className="text-xs text-amber-600">URL doesn't look like a YouTube link — make sure it's a watch/share URL.</p>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pro tips & variations <span className="text-xs text-muted-foreground">(min 3)</span></h2>
          <Button size="sm" variant="outline" onClick={() => setTips([...tips, ""])}><Plus className="w-3 h-3 mr-1" />Add tip</Button>
        </div>
        {tips.length === 0 && <p className="text-sm text-muted-foreground">No tips yet.</p>}
        {tips.map((t, i) => (
          <div key={i} className="flex gap-2">
            <Textarea rows={2} value={t} onChange={(e) => { const next = [...tips]; next[i] = e.target.value; setTips(next); }} />
            <Button size="icon" variant="ghost" onClick={() => setTips(tips.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
      </CardContent></Card>

      <Card><CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">Shop this recipe (affiliate module)</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={generateAmazonItems} disabled={generating || !shopLoaded}>
              <Sparkles className="w-3 h-3 mr-1" />{generating ? "Generating…" : "Generate from ingredients (Amazon)"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShop([...shop, { name: "", benefit: "", url: "", image_url: "", is_affiliate: true, position: shop.length, _new: true }])}>
              <Plus className="w-3 h-3 mr-1" />Add item
            </Button>
          </div>
        </div>
        {shopLoaded && shop.filter((s) => !s._delete).length === 0 && <p className="text-sm text-muted-foreground">No shop items yet. Add tools, appliances, or specialty ingredients.</p>}
        <div className="space-y-3">
          {shop.map((s, i) => s._delete ? null : (
            <div key={s.id || `new-${i}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 rounded-lg border border-border">
              <div className="md:col-span-3">
                <Label className="text-xs">Name</Label>
                <Input value={s.name} onChange={(e) => updateShop(i, { name: e.target.value })} />
              </div>
              <div className="md:col-span-4">
                <Label className="text-xs">Benefit</Label>
                <Input value={s.benefit} onChange={(e) => updateShop(i, { benefit: e.target.value })} placeholder="Why this product" />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">URL</Label>
                <Input value={s.url} onChange={(e) => updateShop(i, { url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Image URL</Label>
                <Input value={s.image_url} onChange={(e) => updateShop(i, { image_url: e.target.value })} />
              </div>
              <div className="md:col-span-12 flex items-center justify-between text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={s.is_affiliate} onChange={(e) => updateShop(i, { is_affiliate: e.target.checked })} />
                  Affiliate link (adds rel=sponsored)
                </label>
                <Button size="sm" variant="ghost" onClick={() => updateShop(i, { _delete: true })}><Trash2 className="w-3 h-3 mr-1" />Remove</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-5 space-y-3">
        <h2 className="font-semibold">Serving & storage</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Serving suggestions</Label>
            <Textarea rows={4} value={r.serving_suggestions || ""} onChange={(e) => setR({ ...r, serving_suggestions: e.target.value })} />
          </div>
          <div>
            <Label>Storage</Label>
            <Textarea rows={4} value={r.storage_instructions || ""} onChange={(e) => setR({ ...r, storage_instructions: e.target.value })} />
          </div>
          <div>
            <Label>Reheating</Label>
            <Textarea rows={4} value={r.reheating_instructions || ""} onChange={(e) => setR({ ...r, reheating_instructions: e.target.value })} />
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-5 space-y-3">
        <h2 className="font-semibold">Internal scoring (0–10, hidden from public)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ["score_affiliate", "Affiliate potential"],
            ["score_video", "Video appeal"],
            ["score_event", "Event/catering"],
            ["score_seasonal", "Seasonal"],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input type="number" min={0} max={10} value={r[key] ?? 0} onChange={(e) => setR({ ...r, [key]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
            </div>
          ))}
        </div>
      </CardContent></Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}
