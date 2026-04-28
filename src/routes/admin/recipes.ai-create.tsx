import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Loader2, Plus, Trash2, RefreshCw, Image as ImageIcon, Save, Send, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  generateRecipeDraft,
  bulkGenerateRecipeDrafts,
  regenerateRecipeSection,
  generateAiRecipeImage,
  saveAiRecipe,
} from "@/lib/server-fns/ai-recipe-create.functions";

const TONES = [
  "Friendly & Casual",
  "Confident & Bold",
  "Cozy & Comforting",
  "Straightforward & Practical",
  "Viral / Feed-Optimized",
] as const;
const CATEGORIES = ["Easy Meal", "Copycat Recipe", "How-To"] as const;

export const Route = createFileRoute("/admin/recipes/ai-create")({
  head: () => ({ meta: [{ title: "Create Recipe (AI) — Admin" }] }),
  component: AiCreatePage,
});

type RecipeDraft = {
  title: string;
  category: string;
  description: string;
  servings: number;
  prep_time_minutes: number;
  cook_time_minutes: number;
  ingredients: Array<{ name: string; quantity: number; unit: string }>;
  steps: string[];
  notes: { substitutions: string; storage: string; reheating: string };
  seo_title: string;
  seo_description: string;
  feed_summary: string;
  image_url?: string | null;
  suggested_tools: Array<{ name: string; reason: string; status?: "suggested" | "added" | "dismissed"; affiliate_url?: string }>;
};

function AiCreatePage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  // input state
  const [tone, setTone] = useState<(typeof TONES)[number]>("Friendly & Casual");
  const [category, setCategory] = useState<string>("");
  const [promptText, setPromptText] = useState("");
  const [dishName, setDishName] = useState("");
  const [ingredientsList, setIngredientsList] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [copycatNotes, setCopycatNotes] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // bulk
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkCount, setBulkCount] = useState(3);
  const [variationType, setVariationType] = useState<"flavor" | "protein" | "method">("flavor");
  const [bulkDrafts, setBulkDrafts] = useState<Array<{ recipe: RecipeDraft; meta: any } | { error: string }>>([]);

  // single draft
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [regenSection, setRegenSection] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const generate = useServerFn(generateRecipeDraft);
  const bulkGen = useServerFn(bulkGenerateRecipeDrafts);
  const regen = useServerFn(regenerateRecipeSection);
  const genImg = useServerFn(generateAiRecipeImage);
  const save = useServerFn(saveAiRecipe);

  if (loading) return <div className="p-8">Loading…</div>;
  if (!isAdmin) return <div className="p-8 text-destructive">Admin access only.</div>;

  function buildInputs() {
    return {
      promptText: promptText || undefined,
      dishName: dishName || undefined,
      ingredientsList: ingredientsList || undefined,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      videoUrl: videoUrl || undefined,
      copycatNotes: copycatNotes || undefined,
      tone,
      category: (category || undefined) as any,
    };
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const path = `refs/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const { error } = await supabase.storage.from("recipe-ai-uploads").upload(path, file, { upsert: true });
        if (error) throw error;
        const { data: signed } = await supabase.storage.from("recipe-ai-uploads").createSignedUrl(path, 60 * 60);
        if (signed?.signedUrl) urls.push(signed.signedUrl);
      }
      setImageUrls((prev) => [...prev, ...urls]);
      toast.success(`Uploaded ${urls.length} reference image(s)`);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      if (bulkMode) {
        const r = await bulkGen({ data: { ...buildInputs(), count: bulkCount, variationType } });
        if (!r.success) throw new Error("Bulk generation failed");
        setBulkDrafts(r.drafts as any);
        toast.success(`Generated ${r.drafts.length} drafts`);
      } else {
        const r = await generate({ data: buildInputs() });
        if (!r.success) throw new Error(r.error);
        setDraft({ ...(r.recipe as any), image_url: null });
        setMeta(r.meta);
        toast.success("Recipe draft generated");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegen(section: "title" | "ingredients" | "steps" | "notes" | "seo" | "feed" | "tools") {
    if (!draft) return;
    setRegenSection(section);
    try {
      const r = await regen({ data: { recipe: draft, section, tone } });
      if (!r.success) throw new Error(r.error);
      setDraft({ ...(r.recipe as any), image_url: draft.image_url });
      toast.success(`Regenerated ${section}`);
    } catch (e: any) {
      toast.error(e.message ?? "Regen failed");
    } finally {
      setRegenSection(null);
    }
  }

  async function handleGenerateImage() {
    if (!draft) return;
    setImageBusy(true);
    try {
      const r = await genImg({
        data: { title: draft.title, description: draft.description, category: draft.category },
      });
      if (!r.success) throw new Error("Image generation failed");
      setDraft({ ...draft, image_url: r.image_url });
      toast.success("Image generated");
    } catch (e: any) {
      toast.error(e.message ?? "Image failed");
    } finally {
      setImageBusy(false);
    }
  }

  async function handleCustomImage(files: FileList | null) {
    if (!files?.[0] || !draft) return;
    setImageBusy(true);
    try {
      const file = files[0];
      const path = `ai-create/custom-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const { error } = await supabase.storage.from("recipe-photos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("recipe-photos").getPublicUrl(path);
      setDraft({ ...draft, image_url: pub.publicUrl });
      toast.success("Custom image uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setImageBusy(false);
    }
  }

  async function handleSave(publish: boolean) {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await save({
        data: {
          recipe: draft as any,
          inputs: buildInputs(),
          meta,
          tone,
          publish,
        },
      });
      toast.success(publish ? "Recipe published!" : "Draft saved");
      navigate({ to: "/admin/recipes/$id/edit", params: { id: r.recipe_id! } });
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Create Recipe (AI)
          </h1>
          <p className="text-muted-foreground text-sm">
            Generate complete, editable recipes from prompts, ingredients, images, or inspiration.
          </p>
        </div>
        <Badge variant="secondary">Admin only</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* INPUT PANEL */}
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tone</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category (optional)</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Auto" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs defaultValue="prompt">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="dish">Dish name</TabsTrigger>
                <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
                <TabsTrigger value="image">Images</TabsTrigger>
                <TabsTrigger value="video">Video</TabsTrigger>
                <TabsTrigger value="copycat">Copycat</TabsTrigger>
              </TabsList>
              <TabsContent value="prompt">
                <Textarea rows={4} placeholder="e.g. Easy creamy chicken dinner using pantry ingredients"
                  value={promptText} onChange={(e) => setPromptText(e.target.value)} />
              </TabsContent>
              <TabsContent value="dish">
                <Input placeholder="e.g. Garlic Butter Chicken Pasta" value={dishName} onChange={(e) => setDishName(e.target.value)} />
              </TabsContent>
              <TabsContent value="ingredients">
                <Textarea rows={5} placeholder="One per line:&#10;chicken thighs&#10;garlic&#10;cream&#10;pasta"
                  value={ingredientsList} onChange={(e) => setIngredientsList(e.target.value)} />
              </TabsContent>
              <TabsContent value="image" className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input type="file" accept="image/*" multiple disabled={uploading}
                    onChange={(e) => handleUpload(e.target.files)} />
                  {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
                {imageUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {imageUrls.map((u, i) => (
                      <div key={i} className="relative">
                        <img src={u} alt="" className="h-16 w-16 object-cover rounded" />
                        <button onClick={() => setImageUrls((p) => p.filter((_, j) => j !== i))}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="video">
                <Input placeholder="https://… (TikTok, YouTube, etc.)" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">URL is referenced in the prompt; add notes about flavor/technique below for best results.</p>
              </TabsContent>
              <TabsContent value="copycat">
                <Textarea rows={3} placeholder="Inspired by a popular fast-food chicken sandwich. Flavor notes: crispy, slightly spicy."
                  value={copycatNotes} onChange={(e) => setCopycatNotes(e.target.value)} />
              </TabsContent>
            </Tabs>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Switch checked={bulkMode} onCheckedChange={setBulkMode} id="bulk" />
                <Label htmlFor="bulk">Bulk Mode — generate multiple variations</Label>
              </div>
              {bulkMode && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Number of recipes (1–10)</Label>
                    <Input type="number" min={1} max={10} value={bulkCount}
                      onChange={(e) => setBulkCount(Math.min(10, Math.max(1, +e.target.value || 1)))} />
                  </div>
                  <div>
                    <Label>Variation type</Label>
                    <Select value={variationType} onValueChange={(v) => setVariationType(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flavor">Flavor</SelectItem>
                        <SelectItem value="protein">Protein</SelectItem>
                        <SelectItem value="method">Cooking method</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {bulkMode ? `Generate ${bulkCount} Drafts` : "Generate Recipe"}
            </Button>
          </CardContent>
        </Card>

        {/* DRAFT EDITOR */}
        <div className="space-y-4">
          {bulkMode && bulkDrafts.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Bulk Results ({bulkDrafts.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {bulkDrafts.map((d, i) => (
                  <div key={i} className="border rounded p-3 flex items-center justify-between">
                    {"error" in d ? (
                      <span className="text-destructive text-sm">Error: {d.error}</span>
                    ) : (
                      <>
                        <div>
                          <div className="font-medium">{d.recipe.title}</div>
                          <div className="text-xs text-muted-foreground">{d.recipe.category}</div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => {
                          setDraft({ ...(d as any).recipe, image_url: null });
                          setMeta((d as any).meta);
                          setBulkMode(false);
                        }}>Open</Button>
                      </>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!draft && !bulkDrafts.length && (
            <Card><CardContent className="p-12 text-center text-muted-foreground">
              Generated recipe will appear here.
            </CardContent></Card>
          )}

          {draft && <DraftEditor
            draft={draft} setDraft={setDraft}
            tone={tone} setTone={setTone}
            onRegen={handleRegen} regenSection={regenSection}
            onGenerateImage={handleGenerateImage} onCustomImage={handleCustomImage} imageBusy={imageBusy}
            onSave={handleSave} saving={saving}
          />}
        </div>
      </div>
    </div>
  );
}

function DraftEditor({
  draft, setDraft, tone, setTone, onRegen, regenSection,
  onGenerateImage, onCustomImage, imageBusy, onSave, saving,
}: {
  draft: RecipeDraft;
  setDraft: (d: RecipeDraft) => void;
  tone: string; setTone: (t: any) => void;
  onRegen: (s: any) => void; regenSection: string | null;
  onGenerateImage: () => void; onCustomImage: (f: FileList | null) => void; imageBusy: boolean;
  onSave: (publish: boolean) => void; saving: boolean;
}) {
  const canPublish = !!draft.title && draft.ingredients.length > 0 && draft.steps.length > 0 && !!draft.image_url;

  function regenBtn(section: any) {
    return (
      <Button size="sm" variant="ghost" onClick={() => onRegen(section)} disabled={regenSection === section}>
        {regenSection === section ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Draft Editor</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Tone:</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Image */}
        <div className="border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="flex items-center gap-1"><ImageIcon className="h-4 w-4" /> Image</Label>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={onGenerateImage} disabled={imageBusy}>
                {imageBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                {draft.image_url ? "Regenerate" : "Generate"}
              </Button>
              <label className="cursor-pointer">
                <Button size="sm" variant="outline" asChild><span><Upload className="h-3 w-3 mr-1" />Upload</span></Button>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onCustomImage(e.target.files)} />
              </label>
            </div>
          </div>
          {draft.image_url ? (
            <img src={draft.image_url} alt="" className="w-full max-h-72 object-cover rounded" />
          ) : (
            <div className="h-32 bg-muted rounded flex items-center justify-center text-sm text-muted-foreground">
              No image yet
            </div>
          )}
        </div>

        {/* Title + category */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <div className="flex items-center justify-between"><Label>Title</Label>{regenBtn("title")}</div>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><Label>Servings</Label><Input type="number" value={draft.servings}
            onChange={(e) => setDraft({ ...draft, servings: +e.target.value })} /></div>
          <div><Label>Prep (min)</Label><Input type="number" value={draft.prep_time_minutes}
            onChange={(e) => setDraft({ ...draft, prep_time_minutes: +e.target.value })} /></div>
          <div><Label>Cook (min)</Label><Input type="number" value={draft.cook_time_minutes}
            onChange={(e) => setDraft({ ...draft, cook_time_minutes: +e.target.value })} /></div>
        </div>

        {/* Ingredients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Ingredients</Label>
            <div className="flex gap-1">
              {regenBtn("ingredients")}
              <Button size="sm" variant="ghost" onClick={() => setDraft({
                ...draft, ingredients: [...draft.ingredients, { name: "", quantity: 1, unit: "" }],
              })}><Plus className="h-3 w-3" /></Button>
            </div>
          </div>
          <div className="space-y-1">
            {draft.ingredients.map((ing, i) => (
              <div key={i} className="grid grid-cols-12 gap-1">
                <Input className="col-span-6" placeholder="name" value={ing.name}
                  onChange={(e) => { const a = [...draft.ingredients]; a[i] = { ...a[i], name: e.target.value }; setDraft({ ...draft, ingredients: a }); }} />
                <Input className="col-span-2" type="number" step="0.01" value={ing.quantity}
                  onChange={(e) => { const a = [...draft.ingredients]; a[i] = { ...a[i], quantity: +e.target.value }; setDraft({ ...draft, ingredients: a }); }} />
                <Input className="col-span-3" placeholder="unit" value={ing.unit}
                  onChange={(e) => { const a = [...draft.ingredients]; a[i] = { ...a[i], unit: e.target.value }; setDraft({ ...draft, ingredients: a }); }} />
                <Button size="icon" variant="ghost" className="col-span-1"
                  onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Steps</Label>
            <div className="flex gap-1">
              {regenBtn("steps")}
              <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, steps: [...draft.steps, ""] })}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {draft.steps.map((step, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-xs text-muted-foreground w-6 pt-2">{i + 1}.</span>
                <Textarea rows={2} value={step}
                  onChange={(e) => { const a = [...draft.steps]; a[i] = e.target.value; setDraft({ ...draft, steps: a }); }} />
                <Button size="icon" variant="ghost"
                  onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="border rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label>Notes</Label>{regenBtn("notes")}
          </div>
          <div>
            <Label className="text-xs">Substitutions</Label>
            <Textarea rows={2} value={draft.notes.substitutions}
              onChange={(e) => setDraft({ ...draft, notes: { ...draft.notes, substitutions: e.target.value } })} />
          </div>
          <div>
            <Label className="text-xs">Storage</Label>
            <Textarea rows={2} value={draft.notes.storage}
              onChange={(e) => setDraft({ ...draft, notes: { ...draft.notes, storage: e.target.value } })} />
          </div>
          <div>
            <Label className="text-xs">Reheating</Label>
            <Textarea rows={2} value={draft.notes.reheating}
              onChange={(e) => setDraft({ ...draft, notes: { ...draft.notes, reheating: e.target.value } })} />
          </div>
        </div>

        {/* SEO */}
        <div className="border rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label>SEO</Label>{regenBtn("seo")}
          </div>
          <div>
            <Label className="text-xs">SEO Title</Label>
            <Input value={draft.seo_title} onChange={(e) => setDraft({ ...draft, seo_title: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">SEO Description ({draft.seo_description.length}/160)</Label>
            <Textarea rows={2} value={draft.seo_description}
              onChange={(e) => setDraft({ ...draft, seo_description: e.target.value })} />
          </div>
        </div>

        {/* Feed */}
        <div className="border rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label>Feed Summary (1 sentence, no hashtags)</Label>{regenBtn("feed")}
          </div>
          <Textarea rows={2} value={draft.feed_summary}
            onChange={(e) => setDraft({ ...draft, feed_summary: e.target.value })} />
        </div>

        {/* Tools */}
        <div className="border rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label>Suggested tools (affiliate)</Label>{regenBtn("tools")}
          </div>
          {draft.suggested_tools.length === 0 && <p className="text-xs text-muted-foreground">No suggestions.</p>}
          {draft.suggested_tools.map((t, i) => (
            <div key={i} className="border rounded p-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.reason}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => {
                    const url = window.prompt("Affiliate URL", t.affiliate_url ?? "");
                    if (url) {
                      const a = [...draft.suggested_tools];
                      a[i] = { ...a[i], affiliate_url: url, status: "added" };
                      setDraft({ ...draft, suggested_tools: a });
                    }
                  }}>Add link</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraft({
                    ...draft, suggested_tools: draft.suggested_tools.filter((_, j) => j !== i),
                  })}>Dismiss</Button>
                </div>
              </div>
              {t.affiliate_url && <div className="text-xs text-primary mt-1 truncate">{t.affiliate_url}</div>}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onSave(false)} disabled={saving} className="flex-1">
            <Save className="h-4 w-4 mr-1" /> Save Draft
          </Button>
          <Button onClick={() => onSave(true)} disabled={saving || !canPublish} className="flex-1">
            <Send className="h-4 w-4 mr-1" /> Publish Recipe
          </Button>
        </div>
        {!canPublish && (
          <p className="text-xs text-muted-foreground">
            Publishing requires title, ingredients, instructions, and an image.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
