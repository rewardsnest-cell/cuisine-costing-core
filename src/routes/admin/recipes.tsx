import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Trash2, ChefHat } from "lucide-react";

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
  total_cost: number;
  cost_per_serving: number;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
};

function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "", cuisine: "", servings: "4" });

  const load = async () => {
    const { data } = await supabase.from("recipes").select("*").order("name");
    if (data) setRecipes(data as Recipe[]);
  };

  useEffect(() => { load(); }, []);

  const filtered = recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search recipes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
            <Card key={r.id} className="shadow-warm border-border/50 hover:shadow-gold transition-shadow">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-display text-lg font-semibold">{r.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{r.category} · {r.cuisine}</p>
                  </div>
                  <button onClick={() => handleDelete(r.id)} className="text-muted-foreground hover:text-destructive transition-colors">
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
