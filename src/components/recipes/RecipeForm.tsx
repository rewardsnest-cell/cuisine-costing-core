import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Trash2, ChefHat, Check, Sparkles, Loader2, Share2, AlertTriangle, CircleAlert, CheckCircle2, FileEdit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { convertQty, getConvertedUnitCost, getIngredientCostMetrics } from "@/lib/recipe-costing";
import { FlippGenerateButton } from "@/components/admin/FlippGenerateButton";
import { useServerFn } from "@tanstack/react-start";
import { generateRecipePhoto, generateRecipeSocialPhoto } from "@/lib/server/generate-recipe-photos";

type IngredientRow = {
  id?: string; // existing recipe_ingredients row id
  name: string;
  quantity: string;
  unit: string;
  cost_per_unit: string;
  notes: string;
  inventory_item_id: string | null;
  reference_id: string | null;
};

type InvItem = {
  id: string;
  name: string;
  unit: string;
  average_cost_per_unit: number;
  reference_id?: string | null;
};

type RefItem = {
  id: string;
  canonical_name: string;
  default_unit: string;
  category: string | null;
  // present when this reference is already linked to an inventory item
  inventory_item_id?: string | null;
};

const emptyIngredient = (): IngredientRow => ({
  name: "",
  quantity: "",
  unit: "",
  cost_per_unit: "",
  notes: "",
  inventory_item_id: null,
  reference_id: null,
});

export type RecipeFormInitial = {
  recipe: {
    id?: string;
    name: string;
    description: string;
    category: string;
    cuisine: string;
    servings: string;
    prep_time: string;
    cook_time: string;
    instructions: string;
    is_vegetarian: boolean;
    is_vegan: boolean;
    is_gluten_free: boolean;
    allergens: string;
    pricing_status?: string | null;
    pricing_errors?: Array<{ ingredient?: string; issue?: string; message?: string }> | null;
    status?: "draft" | "published";
    ingredient_integrity?: "ok" | "needs_cleanup";
    /** Mark this home_public recipe as part of the "Inspired / Familiar Favorites" public section. */
    inspired?: boolean;
    /** Rollout phase for Inspired content. Admin-only field. */
    inspired_phase?: "off" | "admin_preview" | "soft_launch" | "public";
  };
  ingredients: IngredientRow[];
};

export const blankInitial: RecipeFormInitial = {
  recipe: {
    name: "",
    description: "",
    category: "",
    cuisine: "",
    servings: "4",
    prep_time: "",
    cook_time: "",
    instructions: "",
    is_vegetarian: false,
    is_vegan: false,
    is_gluten_free: false,
    allergens: "",
    status: "draft",
    ingredient_integrity: "ok",
    inspired: false,
    inspired_phase: "off",
  },
  ingredients: [emptyIngredient()],
};

function IngredientLinker({
  inventory,
  references,
  inventoryId,
  referenceId,
  displayName,
  onPickInventory,
  onPickReference,
  onTypeFreeText,
}: {
  inventory: InvItem[];
  references: RefItem[];
  inventoryId: string | null;
  referenceId: string | null;
  displayName: string;
  onPickInventory: (inv: InvItem) => void;
  onPickReference: (ref: RefItem) => void;
  onTypeFreeText: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const linkedInv = inventoryId ? inventory.find((i) => i.id === inventoryId) : null;
  const linkedRef = referenceId ? references.find((r) => r.id === referenceId) : null;
  // Hide reference rows that are already represented by an inventory item to avoid duplicates.
  const inventoryRefIds = new Set(inventory.map((i) => i.reference_id).filter(Boolean) as string[]);
  const refsOnly = references.filter((r) => !inventoryRefIds.has(r.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm",
            "hover:bg-muted/40 transition-colors text-left",
            !displayName && "text-muted-foreground",
          )}
        >
          <span className="truncate">{displayName || "Pick or type ingredient…"}</span>
          {(linkedInv || linkedRef) && <Check className="w-3.5 h-3.5 text-success shrink-0 ml-2" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[320px]" align="start">
        <Command>
          <CommandInput
            placeholder="Search inventory or canonical ingredients…"
            defaultValue={displayName}
            onValueChange={(v) => onTypeFreeText(v)}
          />
          <CommandList>
            <CommandEmpty>
              <span className="text-xs text-muted-foreground">
                No match — your typed text will be used as a manual ingredient.
              </span>
            </CommandEmpty>
            {inventory.length > 0 && (
              <CommandGroup heading="Inventory items">
                {inventory.map((inv) => (
                  <CommandItem
                    key={`inv-${inv.id}`}
                    value={`inv ${inv.name}`}
                    onSelect={() => {
                      onPickInventory(inv);
                      setOpen(false);
                    }}
                  >
                    <div className="flex justify-between w-full items-center gap-2">
                      <span className="truncate">{inv.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ${Number(inv.average_cost_per_unit).toFixed(2)}/{inv.unit}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {refsOnly.length > 0 && (
              <CommandGroup heading="Canonical ingredients (no inventory yet)">
                {refsOnly.map((ref) => (
                  <CommandItem
                    key={`ref-${ref.id}`}
                    value={`ref ${ref.canonical_name}`}
                    onSelect={() => {
                      onPickReference(ref);
                      setOpen(false);
                    }}
                  >
                    <div className="flex justify-between w-full items-center gap-2">
                      <span className="truncate">{ref.canonical_name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {ref.category ? `${ref.category} · ` : ""}{ref.default_unit}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function RecipeForm({
  mode,
  initial,
  recipeId,
}: {
  mode: "create" | "edit";
  initial: RecipeFormInitial;
  recipeId?: string;
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initial.recipe);
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initial.ingredients.length ? initial.ingredients : [emptyIngredient()],
  );
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [references, setReferences] = useState<RefItem[]>([]);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [socialUrl, setSocialUrl] = useState<string | null>(null);
  const [genHero, setGenHero] = useState(false);
  const [genSocial, setGenSocial] = useState(false);
  const genHeroFn = useServerFn(generateRecipePhoto);
  const genSocialFn = useServerFn(generateRecipeSocialPhoto);

  useEffect(() => {
    (async () => {
      // Pull inventory items + their canonical reference link, AND the full
      // canonical reference list. This lets admins pick a canonical ingredient
      // even when no inventory item exists for it yet.
      const [{ data: invData }, { data: refData }] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("id,name,unit,average_cost_per_unit,ingredient_reference(id)")
          .order("name"),
        supabase
          .from("ingredient_reference")
          .select("id,canonical_name,default_unit,category,inventory_item_id")
          .order("canonical_name"),
      ]);
      const mappedInv = (invData ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        unit: row.unit,
        average_cost_per_unit: row.average_cost_per_unit,
        reference_id: Array.isArray(row.ingredient_reference)
          ? row.ingredient_reference[0]?.id ?? null
          : row.ingredient_reference?.id ?? null,
      })) as InvItem[];
      setInventory(mappedInv);
      setReferences((refData ?? []) as RefItem[]);
    })();
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !recipeId) return;
    (async () => {
      const { data } = await supabase
        .from("recipes")
        .select("image_url,social_image_url")
        .eq("id", recipeId)
        .maybeSingle();
      if (data) {
        setHeroUrl((data as any).image_url ?? null);
        setSocialUrl((data as any).social_image_url ?? null);
      }
    })();
  }, [mode, recipeId]);

  const handleGenerateHero = async () => {
    if (!recipeId) return;
    setGenHero(true);
    try {
      const out = await genHeroFn({ data: { recipeId } });
      setHeroUrl(out.url);
      toast.success("Hero photo generated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate hero photo");
    } finally {
      setGenHero(false);
    }
  };

  const handleGenerateSocial = async () => {
    if (!recipeId) return;
    setGenSocial(true);
    try {
      const out = await genSocialFn({ data: { recipeId } });
      setSocialUrl(out.url);
      toast.success("Social image generated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate social image");
    } finally {
      setGenSocial(false);
    }
  };

  const updateIngredient = (idx: number, patch: Partial<IngredientRow>) => {
    setIngredients((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => setIngredients((prev) => [...prev, emptyIngredient()]);
  const removeRow = (idx: number) =>
    setIngredients((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const totalCost = useMemo(
    () =>
      ingredients.reduce((sum, ing) => {
        const inv = ing.inventory_item_id ? inventory.find((item) => item.id === ing.inventory_item_id) : null;
        return sum + getIngredientCostMetrics({
          quantity: parseFloat(ing.quantity) || 0,
          unit: ing.unit,
          fallbackCostPerUnit: parseFloat(ing.cost_per_unit) || 0,
          inventoryItem: inv
            ? { average_cost_per_unit: inv.average_cost_per_unit, unit: inv.unit }
            : null,
        }).lineTotal;
      }, 0),
    [ingredients, inventory],
  );
  const servingsNum = parseInt(form.servings) || 0;
  const costPerServing = servingsNum > 0 ? totalCost / servingsNum : 0;

  // Auto-resolve a free-text ingredient to its canonical ingredient_reference
  // using the existing fuzzy/synonym matcher RPC. Returns reference_id when a
  // confident match is found.
  const autoResolveReference = async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const { data } = await supabase.rpc("find_ingredient_matches", { _name: trimmed, _limit: 1 });
      const top = (data as any[] | null)?.[0];
      if (!top) return null;
      // Synonym hits are exact; reference hits >=0.8 are safe to auto-link.
      if (top.source === "synonym") return top.reference_id ?? null;
      if ((top.similarity ?? 0) >= 0.8) return top.reference_id ?? null;
      return null;
    } catch {
      return null;
    }
  };

  // Resolve all rows that don't yet have a reference_id (or inventory link).
  // Mutates state so the user immediately sees what got linked.
  const runAutoMatch = async (): Promise<IngredientRow[]> => {
    const next = await Promise.all(
      ingredients.map(async (ing) => {
        if (!ing.name.trim()) return ing;
        if (ing.reference_id) return ing;
        // If linked to inventory but no reference_id yet, prefer the inventory's reference
        if (ing.inventory_item_id) {
          const inv = inventory.find((i) => i.id === ing.inventory_item_id);
          if (inv?.reference_id) return { ...ing, reference_id: inv.reference_id };
        }
        const refId = await autoResolveReference(ing.name);
        return refId ? { ...ing, reference_id: refId } : ing;
      }),
    );
    setIngredients(next);
    return next;
  };

  const unresolvedRows = (rows: IngredientRow[]) =>
    rows
      .filter((i) => i.name.trim())
      .filter(
        (i) =>
          !i.reference_id ||
          !i.unit.trim() ||
          !(parseFloat(i.quantity) > 0),
      );

  const persist = async (opts: { publish: boolean }): Promise<void> => {
    if (!form.name.trim()) {
      toast.error("Recipe name is required");
      return;
    }
    setSaving(true);
    try {
      const allergensArr = form.allergens
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      // Try to resolve any unlinked ingredients before publishing
      const rowsForSave = opts.publish ? await runAutoMatch() : ingredients;

      if (opts.publish) {
        const blockers = unresolvedRows(rowsForSave);
        if (rowsForSave.filter((i) => i.name.trim()).length === 0) {
          toast.error("Add at least one ingredient before publishing");
          return;
        }
        if (blockers.length > 0) {
          toast.error(
            `Cannot publish — ${blockers.length} ingredient${blockers.length === 1 ? "" : "s"} still need linking, a unit, or a positive quantity`,
          );
          return;
        }
      }

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description || null,
        category: form.category || null,
        cuisine: form.cuisine || null,
        servings: servingsNum || 4,
        prep_time: form.prep_time ? parseInt(form.prep_time) : null,
        cook_time: form.cook_time ? parseInt(form.cook_time) : null,
        instructions: form.instructions || null,
        is_vegetarian: form.is_vegetarian,
        is_vegan: form.is_vegan,
        is_gluten_free: form.is_gluten_free,
        allergens: allergensArr.length ? allergensArr : null,
        total_cost: totalCost,
        cost_per_serving: costPerServing,
        // Inspired / Familiar Favorites flag — DB trigger enforces home_public scope.
        inspired: !!form.inspired,
        inspired_phase: form.inspired ? (form.inspired_phase ?? "off") : "off",
      };
      if (mode === "create") {
        // Force draft on creation regardless of publish intent — publish is a
        // second step so the publish trigger sees ingredients already inserted.
        payload.status = "draft";
        payload.created_source = "manual";
      }

      let savedId = recipeId;
      if (mode === "create") {
        const { data, error } = await supabase
          .from("recipes")
          .insert(payload as any)
          .select()
          .single();
        if (error) throw error;
        savedId = data.id;
      } else if (mode === "edit" && recipeId) {
        // Move to draft first if currently published — otherwise the
        // recipe_ingredient_resolved_gate trigger blocks any free-text edits.
        if (initial.recipe.status === "published") {
          const { error: draftErr } = await supabase
            .from("recipes")
            .update({ status: "draft" } as any)
            .eq("id", recipeId);
          if (draftErr) throw draftErr;
        }
        const { error } = await supabase.from("recipes").update(payload as any).eq("id", recipeId);
        if (error) throw error;
        const { error: delErr } = await supabase
          .from("recipe_ingredients")
          .delete()
          .eq("recipe_id", recipeId);
        if (delErr) throw delErr;
      }

      const validIngredients = rowsForSave.filter((i) => i.name.trim());
      if (validIngredients.length > 0 && savedId) {
        // Force-canonical: for any row with a resolved reference_id, convert
        // qty into ingredient_reference.default_unit when convertible. Falls
        // back to the user-entered unit if conversion isn't possible (e.g.
        // count↔weight without a density).
        const refIds = Array.from(
          new Set(validIngredients.map((i) => i.reference_id).filter(Boolean) as string[]),
        );
        const refUnitMap = new Map<string, string>();
        if (refIds.length > 0) {
          const { data: refRows } = await supabase
            .from("ingredient_reference")
            .select("id,default_unit")
            .in("id", refIds);
          for (const row of (refRows ?? []) as Array<{ id: string; default_unit: string }>) {
            if (row.default_unit?.trim()) refUnitMap.set(row.id, row.default_unit.trim());
          }
        }
        const { error: ingErr } = await supabase.from("recipe_ingredients").insert(
          validIngredients.map((ing) => {
            const rawQty = parseFloat(ing.quantity) || 0;
            const rawUnit = ing.unit.trim() || "each";
            const targetUnit = ing.reference_id ? refUnitMap.get(ing.reference_id) : null;
            let storeQty = rawQty;
            let storeUnit = rawUnit;
            if (targetUnit && targetUnit.toLowerCase() !== rawUnit.toLowerCase() && rawQty > 0) {
              const converted = convertQty(rawQty, rawUnit, targetUnit);
              if (converted !== null) {
                storeQty = converted;
                storeUnit = targetUnit;
              }
              // else: keep raw — incompatible families. Surface via UI hint.
            } else if (targetUnit && !rawUnit) {
              storeUnit = targetUnit;
            }
            return {
              recipe_id: savedId!,
              name: ing.name.trim(),
              quantity: storeQty,
              unit: storeUnit,
              cost_per_unit: ing.cost_per_unit ? parseFloat(ing.cost_per_unit) : 0,
              notes: ing.notes || null,
              inventory_item_id: ing.inventory_item_id,
              reference_id: ing.reference_id,
            };
          }),
        );
        if (ingErr) throw ingErr;
      }

      // Flip to published only when the user explicitly asked. The DB trigger
      // is the source of truth and will reject if anything is unresolved.
      if (opts.publish && savedId) {
        const { error: pubErr } = await supabase
          .from("recipes")
          .update({ status: "published" } as any)
          .eq("id", savedId);
        if (pubErr) throw pubErr;
      }

      toast.success(
        opts.publish
          ? "Recipe published"
          : mode === "create"
            ? "Draft saved"
            : "Recipe updated",
      );
      navigate({ to: "/admin/recipes" });
    } catch (e: any) {
      toast.error(e.message || "Failed to save recipe");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = () => persist({ publish: false });
  const handlePublish = () => persist({ publish: true });

  const handleUnpublish = async () => {
    if (!recipeId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("recipes")
        .update({ status: "draft" } as any)
        .eq("id", recipeId);
      if (error) throw error;
      toast.success("Moved back to draft");
      navigate({ to: "/admin/recipes" });
    } catch (e: any) {
      toast.error(e.message || "Failed to unpublish");
    } finally {
      setSaving(false);
    }
  };

  const handleAutoMatchClick = async () => {
    const before = ingredients.filter((i) => i.name.trim() && !i.reference_id).length;
    const after = await runAutoMatch();
    const remaining = after.filter((i) => i.name.trim() && !i.reference_id).length;
    const linked = before - remaining;
    if (linked > 0) toast.success(`Auto-linked ${linked} ingredient${linked === 1 ? "" : "s"}`);
    else toast.info("No additional ingredients could be auto-linked");
  };

  const currentStatus: "draft" | "published" = initial.recipe.status ?? "draft";
  const currentIntegrity = initial.recipe.ingredient_integrity ?? "ok";
  const liveUnresolved = unresolvedRows(ingredients);
  const canPublish = liveUnresolved.length === 0 && ingredients.some((i) => i.name.trim());

  return (
    <div className="space-y-6 max-w-4xl">
      <Button
        variant="ghost"
        onClick={() => navigate({ to: "/admin/recipes" })}
        className="gap-2 -ml-2"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Recipes
      </Button>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <ChefHat className="w-7 h-7 text-primary" />
          <h1 className="font-display text-2xl font-bold">
            {mode === "create" ? "New Recipe" : "Edit Recipe"}
          </h1>
        </div>
        {mode === "edit" && recipeId && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateHero}
              disabled={genHero}
              className="gap-2"
            >
              {genHero ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {heroUrl ? "Regenerate AI hero" : "Generate AI hero"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateSocial}
              disabled={genSocial}
              className="gap-2"
            >
              {genSocial ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              {socialUrl ? "Regenerate AI social" : "Generate AI social"}
            </Button>
            <FlippGenerateButton
              target={{ kind: "recipe", id: recipeId, column: "coupon_image_url" }}
              templateKey="recipe-coupon"
              label="Generate Social Image with Coupon"
              values={[
                { name: "title", value: form.name || null },
                { name: "subtitle", value: form.description || form.category || null },
                { name: "description", value: form.description || null },
                { name: "category", value: form.category || null },
                { name: "cuisine", value: form.cuisine || null },
                { name: "coupon_text", value: null },
                { name: "valid_until", value: null },
              ]}
              onGenerated={() => toast.success("Coupon image saved to this recipe")}
            />
          </div>
        )}
      </div>

      {/* Lifecycle status + ingredient integrity summary */}
      <Card className="border-border/60">
        <CardContent className="p-5 flex flex-wrap items-center gap-3">
          <Badge
            variant={currentStatus === "published" ? "default" : "secondary"}
            className="uppercase tracking-wide"
          >
            {currentStatus}
          </Badge>
          {currentIntegrity === "needs_cleanup" && (
            <Badge variant="destructive" className="gap-1">
              <CircleAlert className="w-3 h-3" /> Needs ingredient cleanup
            </Badge>
          )}
          <span className="text-sm text-muted-foreground flex-1 min-w-[200px]">
            {liveUnresolved.length === 0
              ? "All ingredient lines are resolved — ready to publish."
              : `${liveUnresolved.length} ingredient line${liveUnresolved.length === 1 ? "" : "s"} need linking, a unit, or a positive quantity before publishing.`}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={handleAutoMatchClick} className="gap-1">
            <Sparkles className="w-3.5 h-3.5" /> Auto-match ingredients
          </Button>
        </CardContent>
      </Card>
      {initial.recipe.pricing_status && initial.recipe.pricing_status !== "valid" && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <div>
                  <h3 className="font-semibold text-destructive">
                    Pricing blocked: {initial.recipe.pricing_status.replace("blocked_missing_", "missing ")}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    This recipe will not appear in quote builders or be costed until all issues are resolved.
                  </p>
                </div>
                {Array.isArray(initial.recipe.pricing_errors) && initial.recipe.pricing_errors.length > 0 && (
                  <ul className="text-sm space-y-1 mt-2">
                    {initial.recipe.pricing_errors.map((err, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-medium">{err.ingredient || "—"}:</span>
                        <span className="text-muted-foreground">{err.message || err.issue}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground pt-1">
                  Fix by linking ingredients in the list below to inventory items, or by editing the matching
                  {" "}
                  <a href="/admin/ingredient-reference" className="underline hover:text-primary">ingredient reference</a>
                  {" "}to set density or waste factor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "edit" && recipeId && (heroUrl || socialUrl) && (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-5">
            <h2 className="font-display text-lg font-semibold mb-3">AI-generated photos</h2>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Hero</p>
                {heroUrl ? (
                  <img src={heroUrl} alt={`${form.name} hero`} className="w-full aspect-square object-cover rounded-md border" />
                ) : (
                  <div className="w-full aspect-square rounded-md border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                    No hero yet
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Social</p>
                {socialUrl ? (
                  <img src={socialUrl} alt={`${form.name} social`} className="w-full aspect-square object-cover rounded-md border" />
                ) : (
                  <div className="w-full aspect-square rounded-md border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                    No social yet
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Basics */}
      <Card className="shadow-warm border-border/50">
        <CardContent className="p-5 space-y-4">
          <h2 className="font-display text-lg font-semibold">Basics</h2>
          <div>
            <Label>Recipe Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Beef Bourguignon"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Entrée"
              />
            </div>
            <div>
              <Label>Cuisine</Label>
              <Input
                value={form.cuisine}
                onChange={(e) => setForm({ ...form, cuisine: e.target.value })}
                placeholder="French"
              />
            </div>
            <div>
              <Label>Servings</Label>
              <Input
                type="number"
                value={form.servings}
                onChange={(e) => setForm({ ...form, servings: e.target.value })}
              />
            </div>
            <div>
              <Label>Prep (min)</Label>
              <Input
                type="number"
                value={form.prep_time}
                onChange={(e) => setForm({ ...form, prep_time: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label>Cook (min)</Label>
              <Input
                type="number"
                value={form.cook_time}
                onChange={(e) => setForm({ ...form, cook_time: e.target.value })}
              />
            </div>
            <div className="sm:col-span-3">
              <Label>Allergens (comma separated)</Label>
              <Input
                value={form.allergens}
                onChange={(e) => setForm({ ...form, allergens: e.target.value })}
                placeholder="dairy, gluten, nuts"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.is_vegetarian}
                onCheckedChange={(v) => setForm({ ...form, is_vegetarian: v })}
              />
              Vegetarian
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.is_vegan}
                onCheckedChange={(v) => setForm({ ...form, is_vegan: v })}
              />
              Vegan
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.is_gluten_free}
                onCheckedChange={(v) => setForm({ ...form, is_gluten_free: v })}
              />
              Gluten-Free
            </label>
          </div>
          <div className="flex items-start gap-3 pt-2 border-t border-border/40 mt-2">
            <Switch
              id="inspired-toggle"
              checked={!!form.inspired}
              onCheckedChange={(v) => setForm({ ...form, inspired: v, inspired_phase: v ? (form.inspired_phase ?? "off") : "off" })}
            />
            <div className="text-sm flex-1">
              <label htmlFor="inspired-toggle" className="font-medium block">
                Familiar Favorite
              </label>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md leading-relaxed">
                Marks this recipe as part of Familiar Favorites (home‑only). Only allowed for home-cooking (home_public scope) recipes — the database will reject this for catering recipes.
              </p>
            </div>
          </div>
          {form.inspired && (
            <div className="ml-12 -mt-2 space-y-1.5">
              <label htmlFor="inspired-phase" className="text-xs font-medium text-foreground">
                Rollout phase
              </label>
              <select
                id="inspired-phase"
                value={form.inspired_phase ?? "off"}
                onChange={(e) => setForm({ ...form, inspired_phase: e.target.value as any })}
                className="block w-full max-w-xs rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="off">Off (hidden everywhere)</option>
                <option value="admin_preview">Admin preview (admins only)</option>
                <option value="soft_launch">Soft launch (URL only, no nav)</option>
                <option value="public">Public (visible on /familiar-favorites)</option>
              </select>
              <p className="text-[11px] text-muted-foreground max-w-md">
                Phase changes are audit-logged and create a Change Log draft automatically.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ingredients */}
      <Card className="shadow-warm border-border/50">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Ingredients</h2>
            <Button type="button" size="sm" variant="outline" onClick={addRow} className="gap-1">
              <Plus className="w-4 h-4" /> Add line
            </Button>
          </div>

          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
              <div className="col-span-4">Ingredient</div>
              <div className="col-span-2">Qty</div>
              <div className="col-span-2">Unit</div>
              <div className="col-span-2">Cost / unit</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1"></div>
            </div>

            {ingredients.map((ing, idx) => {
              const inv = ing.inventory_item_id ? inventory.find((item) => item.id === ing.inventory_item_id) : null;
              const ref = ing.reference_id ? references.find((r) => r.id === ing.reference_id) : null;
              const lineTotal = getIngredientCostMetrics({
                quantity: parseFloat(ing.quantity) || 0,
                unit: ing.unit,
                fallbackCostPerUnit: parseFloat(ing.cost_per_unit) || 0,
                inventoryItem: inv
                  ? { average_cost_per_unit: inv.average_cost_per_unit, unit: inv.unit }
                  : null,
              }).lineTotal;
              // Preview canonical-unit normalization that will run on save.
              const targetUnit = ref?.default_unit?.trim() || null;
              const qtyNum = parseFloat(ing.quantity);
              const willNormalize =
                !!targetUnit &&
                ing.unit.trim() !== "" &&
                ing.unit.trim().toLowerCase() !== targetUnit.toLowerCase() &&
                Number.isFinite(qtyNum) &&
                qtyNum > 0;
              const convertedPreview = willNormalize
                ? convertQty(qtyNum, ing.unit, targetUnit!)
                : null;
              const cannotConvert = willNormalize && convertedPreview === null;
              return (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center border border-border/50 sm:border-0 rounded-md p-2 sm:p-0"
                >
                  <div className="col-span-12 sm:col-span-4 space-y-1">
                    <IngredientLinker
                      inventory={inventory}
                      references={references}
                      inventoryId={ing.inventory_item_id}
                      referenceId={ing.reference_id}
                      displayName={ing.name}
                      onPickInventory={(inv) => {
                        const convertedUnitCost = getConvertedUnitCost(
                          ing.unit || inv.unit,
                          inv.unit,
                          inv.average_cost_per_unit,
                        );
                        updateIngredient(idx, {
                          inventory_item_id: inv.id,
                          reference_id: inv.reference_id ?? null,
                          name: inv.name,
                          unit: ing.unit || inv.unit,
                          cost_per_unit:
                            inv.average_cost_per_unit > 0
                              ? String(convertedUnitCost ?? inv.average_cost_per_unit)
                              : ing.cost_per_unit,
                        });
                      }}
                      onPickReference={(ref) => {
                        updateIngredient(idx, {
                          inventory_item_id: null,
                          reference_id: ref.id,
                          name: ref.canonical_name,
                          unit: ing.unit || ref.default_unit,
                        });
                      }}
                      onTypeFreeText={(freeText) => {
                        updateIngredient(idx, {
                          inventory_item_id: null,
                          reference_id: null,
                          name: freeText,
                        });
                      }}
                    />
                    {ing.name.trim() && !ing.reference_id && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
                        <CircleAlert className="w-3 h-3" /> Unlinked — pick a canonical ingredient or add to ingredient reference
                      </span>
                    )}
                    {ing.reference_id && willNormalize && convertedPreview !== null && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        → stored as {convertedPreview.toFixed(4).replace(/\.?0+$/, "")} {targetUnit}
                      </span>
                    )}
                    {cannotConvert && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                        <AlertTriangle className="w-3 h-3" /> Cannot convert {ing.unit} → {targetUnit}; original unit will be kept.
                      </span>
                    )}
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      type="number"
                      step="any"
                      placeholder="Qty"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(idx, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      placeholder="Unit"
                      value={ing.unit}
                      onChange={(e) => updateIngredient(idx, { unit: e.target.value })}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      type="number"
                      step="any"
                      placeholder="$"
                      value={ing.cost_per_unit}
                      onChange={(e) => updateIngredient(idx, { cost_per_unit: e.target.value })}
                    />
                  </div>
                  <div className="col-span-10 sm:col-span-1 text-right text-sm font-medium">
                    ${lineTotal.toFixed(2)}
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={ingredients.length === 1}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-30 p-2"
                      aria-label="Remove ingredient"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-border/40 text-sm">
            <span className="text-muted-foreground">
              {ingredients.filter((i) => i.name.trim()).length} ingredient(s) ·{" "}
              {ingredients.filter((i) => i.inventory_item_id).length} linked
            </span>
            <div className="flex gap-6">
              <span>
                Total: <span className="font-semibold">${totalCost.toFixed(2)}</span>
              </span>
              <span>
                Per serving:{" "}
                <span className="font-semibold text-gradient-gold">
                  ${costPerServing.toFixed(2)}
                </span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="shadow-warm border-border/50">
        <CardContent className="p-5 space-y-3">
          <h2 className="font-display text-lg font-semibold">Instructions</h2>
          <Textarea
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            rows={6}
            placeholder="Step-by-step instructions..."
          />
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end flex-wrap">
        <Button variant="outline" onClick={() => navigate({ to: "/admin/recipes" })}>
          Cancel
        </Button>
        {mode === "edit" && currentStatus === "published" && (
          <Button variant="outline" onClick={handleUnpublish} disabled={saving} className="gap-2">
            <FileEdit className="w-4 h-4" /> Move to draft
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleSaveDraft}
          disabled={saving || !form.name.trim()}
        >
          {saving ? "Saving..." : mode === "create" ? "Save as draft" : "Save changes"}
        </Button>
        <Button
          onClick={handlePublish}
          disabled={saving || !form.name.trim() || !canPublish}
          className="bg-gradient-warm text-primary-foreground gap-2"
          title={!canPublish ? "Resolve all ingredient lines to publish" : undefined}
        >
          <CheckCircle2 className="w-4 h-4" />
          {mode === "edit" && currentStatus === "published" ? "Save & re-publish" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
