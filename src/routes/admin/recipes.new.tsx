import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Trash2, ChefHat } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/recipes/new")({
  component: NewRecipePage,
});

type IngredientRow = {
  name: string;
  quantity: string;
  unit: string;
  cost_per_unit: string;
  notes: string;
};

const emptyIngredient = (): IngredientRow => ({
  name: "",
  quantity: "",
  unit: "",
  cost_per_unit: "",
  notes: "",
});

function NewRecipePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
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
  });
  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    emptyIngredient(),
  ]);

  const updateIngredient = (idx: number, key: keyof IngredientRow, value: string) => {
    setIngredients((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  const addRow = () => setIngredients((prev) => [...prev, emptyIngredient()]);
  const removeRow = (idx: number) =>
    setIngredients((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const totalCost = ingredients.reduce((sum, ing) => {
    const q = parseFloat(ing.quantity) || 0;
    const c = parseFloat(ing.cost_per_unit) || 0;
    return sum + q * c;
  }, 0);
  const servingsNum = parseInt(form.servings) || 0;
  const costPerServing = servingsNum > 0 ? totalCost / servingsNum : 0;

  const handleSave = async () => {
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

      const { data: recipe, error } = await supabase
        .from("recipes")
        .insert({
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
        })
        .select()
        .single();

      if (error) throw error;

      const validIngredients = ingredients.filter((i) => i.name.trim());
      if (validIngredients.length > 0 && recipe) {
        const { error: ingErr } = await supabase.from("recipe_ingredients").insert(
          validIngredients.map((ing) => ({
            recipe_id: recipe.id,
            name: ing.name.trim(),
            quantity: parseFloat(ing.quantity) || 0,
            unit: ing.unit.trim() || "each",
            cost_per_unit: ing.cost_per_unit ? parseFloat(ing.cost_per_unit) : 0,
            notes: ing.notes || null,
          })),
        );
        if (ingErr) throw ingErr;
      }

      toast.success("Recipe created");
      navigate({ to: "/admin/recipes" });
    } catch (e: any) {
      toast.error(e.message || "Failed to create recipe");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Button
        variant="ghost"
        onClick={() => navigate({ to: "/admin/recipes" })}
        className="gap-2 -ml-2"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Recipes
      </Button>

      <div className="flex items-center gap-3">
        <ChefHat className="w-7 h-7 text-primary" />
        <h1 className="font-display text-2xl font-bold">New Recipe</h1>
      </div>

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
            {/* Header row (sm+) */}
            <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
              <div className="col-span-4">Ingredient</div>
              <div className="col-span-2">Qty</div>
              <div className="col-span-2">Unit</div>
              <div className="col-span-2">Cost / unit</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1"></div>
            </div>

            {ingredients.map((ing, idx) => {
              const lineTotal =
                (parseFloat(ing.quantity) || 0) * (parseFloat(ing.cost_per_unit) || 0);
              return (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center border border-border/50 sm:border-0 rounded-md p-2 sm:p-0"
                >
                  <div className="col-span-12 sm:col-span-4">
                    <Input
                      placeholder="e.g. Beef chuck"
                      value={ing.name}
                      onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      type="number"
                      step="any"
                      placeholder="Qty"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(idx, "quantity", e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      placeholder="Unit"
                      value={ing.unit}
                      onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      type="number"
                      step="any"
                      placeholder="$"
                      value={ing.cost_per_unit}
                      onChange={(e) => updateIngredient(idx, "cost_per_unit", e.target.value)}
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
              {ingredients.filter((i) => i.name.trim()).length} ingredient(s)
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

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => navigate({ to: "/admin/recipes" })}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="bg-gradient-warm text-primary-foreground"
        >
          {saving ? "Saving..." : "Create Recipe"}
        </Button>
      </div>
    </div>
  );
}
