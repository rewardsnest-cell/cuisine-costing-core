import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Trash2, ChefHat, ArrowLeft, DollarSign, Clock, Users } from "lucide-react";
import { useActiveSales, SaleBadge } from "@/lib/use-active-sales";
import { UnlinkedIngredientsReview } from "@/components/recipes/UnlinkedIngredientsReview";

export const Route = createFileRoute("/admin/recipes")({
  component: RecipesPage,
});

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  cuisine: string | null;
  servings: number;
  prep_time: number | null;
  cook_time: number | null;
  total_cost: number;
  cost_per_serving: number;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  allergens: string[] | null;
  instructions: string | null;
  active: boolean;
};

type Ingredient = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  cost_per_unit: number | null;
  inventory_item_id: string | null;
  inventory_item?: { name: string; average_cost_per_unit: number; unit: string } | null;
};

function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "off">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "", cuisine: "", servings: "4" });
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const { byItemId: activeSales } = useActiveSales();

  const load = async () => {
    const { data } = await supabase.from("recipes").select("*").order("name");
    if (data) setRecipes(data as Recipe[]);
  };

  useEffect(() => { load(); }, []);

  const filtered = recipes.filter((r) => {
    if (!r.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "active" && r.active === false) return false;
    if (filter === "off" && r.active !== false) return false;
    return true;
  });

  const toggleActive = async (r: Recipe) => {
    await (supabase as any).from("recipes").update({ active: !r.active }).eq("id", r.id);
    load();
  };

  const handleAdd = async () => {
    await supabase.from("recipes").insert({
      name: form.name,
      description: form.description || null,
      category: form.category || null,
      cuisine: form.cuisine || null,
      servings: parseInt(form.servings) || 4,
    });
    setDialogOpen(false);
    setForm({ name: "", description: "", category: "", cuisine: "", servings: "4" });
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("recipes").delete().eq("id", id);
    load();
  };

  const openDetail = async (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setLoadingDetail(true);
    const { data } = await supabase
      .from("recipe_ingredients")
      .select("*, inventory_items(name, average_cost_per_unit, unit)")
      .eq("recipe_id", recipe.id)
      .order("name");
    if (data) {
      setIngredients(
        data.map((d: any) => ({
          ...d,
          inventory_item: d.inventory_items || null,
        }))
      );
    }
    setLoadingDetail(false);
  };

  // Detail view
  if (selectedRecipe) {
    const calcCost = (ing: Ingredient) => {
      if (ing.inventory_item) {
        return ing.quantity * ing.inventory_item.average_cost_per_unit;
      }
      return ing.quantity * (ing.cost_per_unit || 0);
    };

    const totalCost = ingredients.reduce((sum, ing) => sum + calcCost(ing), 0);
    const costPerServing = selectedRecipe.servings > 0 ? totalCost / selectedRecipe.servings : 0;
    const suggestedPrice = costPerServing * 3.5; // 350% markup typical for catering

    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelectedRecipe(null)} className="gap-2 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Back to Recipes
        </Button>

        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{selectedRecipe.name}</h1>
          {selectedRecipe.description && (
            <p className="text-muted-foreground mt-1">{selectedRecipe.description}</p>
          )}
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
            {selectedRecipe.category && <span className="px-2.5 py-0.5 bg-muted rounded-full">{selectedRecipe.category}</span>}
            {selectedRecipe.cuisine && <span className="px-2.5 py-0.5 bg-muted rounded-full">{selectedRecipe.cuisine}</span>}
            {selectedRecipe.is_vegetarian && <span className="px-2.5 py-0.5 bg-success/10 text-success rounded-full">Vegetarian</span>}
            {selectedRecipe.is_vegan && <span className="px-2.5 py-0.5 bg-success/10 text-success rounded-full">Vegan</span>}
            {selectedRecipe.is_gluten_free && <span className="px-2.5 py-0.5 bg-gold/20 text-warm rounded-full">Gluten-Free</span>}
          </div>
          {selectedRecipe.allergens && selectedRecipe.allergens.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selectedRecipe.allergens.map((a) => (
                <span key={a} className="px-2 py-0.5 bg-destructive/10 text-destructive text-xs rounded-full font-medium">{a}</span>
              ))}
            </div>
          )}
        </div>

        {/* Cost Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="shadow-warm border-border/50">
            <CardContent className="p-4 text-center">
              <Users className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-2xl font-bold font-display">{selectedRecipe.servings}</p>
              <p className="text-xs text-muted-foreground">Servings</p>
            </CardContent>
          </Card>
          <Card className="shadow-warm border-border/50">
            <CardContent className="p-4 text-center">
              <DollarSign className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-2xl font-bold font-display">${totalCost.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Total Cost</p>
            </CardContent>
          </Card>
          <Card className="shadow-warm border-border/50">
            <CardContent className="p-4 text-center">
              <DollarSign className="w-5 h-5 text-gold mx-auto mb-1" />
              <p className="text-2xl font-bold font-display text-gradient-gold">${costPerServing.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Cost/Serving</p>
            </CardContent>
          </Card>
          <Card className="shadow-warm border-border/50">
            <CardContent className="p-4 text-center">
              <Clock className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-2xl font-bold font-display">
                {(selectedRecipe.prep_time || 0) + (selectedRecipe.cook_time || 0)}
                <span className="text-sm font-normal text-muted-foreground ml-1">min</span>
              </p>
              <p className="text-xs text-muted-foreground">Prep + Cook</p>
            </CardContent>
          </Card>
        </div>

        {/* Suggested Pricing */}
        <Card className="shadow-warm border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Suggested Menu Price (3.5× markup)</p>
              <p className="text-xs text-muted-foreground">Industry standard catering markup</p>
            </div>
            <p className="font-display text-2xl font-bold text-gradient-gold">${suggestedPrice.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/serving</span></p>
          </CardContent>
        </Card>

        {/* Ingredients Table */}
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Ingredient Cost Breakdown</h2>
          {loadingDetail ? (
            <p className="text-muted-foreground text-sm">Loading ingredients...</p>
          ) : ingredients.length === 0 ? (
            <Card className="shadow-warm border-border/50">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No ingredients linked to this recipe yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-warm border-border/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="py-3 px-4 font-semibold text-muted-foreground">Ingredient</th>
                      <th className="py-3 px-4 font-semibold text-muted-foreground">Qty</th>
                      <th className="py-3 px-4 font-semibold text-muted-foreground">Unit</th>
                      <th className="py-3 px-4 font-semibold text-muted-foreground text-right">Unit Cost</th>
                      <th className="py-3 px-4 font-semibold text-muted-foreground text-right">Line Total</th>
                      <th className="py-3 px-4 font-semibold text-muted-foreground">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing) => {
                      const unitCost = ing.inventory_item
                        ? ing.inventory_item.average_cost_per_unit
                        : (ing.cost_per_unit || 0);
                      const lineTotal = calcCost(ing);
                      const isLinked = !!ing.inventory_item;

                      return (
                        <tr key={ing.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-3 px-4 font-medium">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{ing.name}</span>
                              {ing.inventory_item_id && activeSales[ing.inventory_item_id] && (
                                <SaleBadge sale={activeSales[ing.inventory_item_id]} compact />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">{ing.quantity}</td>
                          <td className="py-3 px-4 text-muted-foreground">{ing.unit}</td>
                          <td className="py-3 px-4 text-right">${unitCost.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-semibold">${lineTotal.toFixed(2)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isLinked ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                              {isLinked ? "Inventory" : "Manual"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30">
                      <td colSpan={4} className="py-3 px-4 font-display font-semibold text-right">Total Recipe Cost</td>
                      <td className="py-3 px-4 text-right font-display font-bold text-lg">${totalCost.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Instructions */}
        {selectedRecipe.instructions && (
          <div>
            <h2 className="font-display text-lg font-semibold mb-3">Instructions</h2>
            <Card className="shadow-warm border-border/50">
              <CardContent className="p-5">
                <p className="text-sm leading-relaxed whitespace-pre-line">{selectedRecipe.instructions}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <UnlinkedIngredientsReview />
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex gap-2 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search recipes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {(["all", "active", "off"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              >
                {f === "all" ? "All" : f === "active" ? "On menu" : "Off menu"}
              </button>
            ))}
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-warm text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> Add Recipe</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Add Recipe</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Recipe Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Entrée" /></div>
                <div><Label>Cuisine</Label><Input value={form.cuisine} onChange={(e) => setForm({ ...form, cuisine: e.target.value })} placeholder="French" /></div>
                <div><Label>Servings</Label><Input type="number" value={form.servings} onChange={(e) => setForm({ ...form, servings: e.target.value })} /></div>
              </div>
              <Button onClick={handleAdd} className="w-full bg-gradient-warm text-primary-foreground" disabled={!form.name}>Add Recipe</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <ChefHat className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No recipes yet. Create your first recipe.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <Card
              key={r.id}
              className={`shadow-warm border-border/50 hover:shadow-gold transition-shadow cursor-pointer ${r.active === false ? "opacity-60" : ""}`}
              onClick={() => openDetail(r)}
            >
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-display text-lg font-semibold">{r.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{r.category} · {r.cuisine}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {r.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{r.description}</p>}
                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                  <span>{r.servings} servings</span>
                  <span>${Number(r.cost_per_serving).toFixed(2)}/serving</span>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {r.is_vegetarian && <span className="px-2 py-0.5 bg-success/10 text-success text-xs rounded-full">Vegetarian</span>}
                  {r.is_vegan && <span className="px-2 py-0.5 bg-success/10 text-success text-xs rounded-full">Vegan</span>}
                  {r.is_gluten_free && <span className="px-2 py-0.5 bg-gold/20 text-warm text-xs rounded-full">GF</span>}
                </div>
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-between mt-4 pt-3 border-t border-border/40"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {r.active === false ? "Off menu" : "On menu"}
                  </span>
                  <Switch checked={r.active !== false} onCheckedChange={() => toggleActive(r)} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
