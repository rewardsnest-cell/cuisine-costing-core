import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RecipeForm, type RecipeFormInitial } from "@/components/recipes/RecipeForm";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/recipes/$id/edit")({
  loader: async ({ params }) => {
    const { data: recipe, error } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!recipe) throw new Error("Recipe not found");

    const { data: ings } = await supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("recipe_id", params.id)
      .order("name");

    const initial: RecipeFormInitial = {
      recipe: {
        id: recipe.id,
        name: recipe.name ?? "",
        description: recipe.description ?? "",
        category: recipe.category ?? "",
        cuisine: recipe.cuisine ?? "",
        servings: String(recipe.servings ?? 4),
        prep_time: recipe.prep_time != null ? String(recipe.prep_time) : "",
        cook_time: recipe.cook_time != null ? String(recipe.cook_time) : "",
        instructions: recipe.instructions ?? "",
        is_vegetarian: !!recipe.is_vegetarian,
        is_vegan: !!recipe.is_vegan,
        is_gluten_free: !!recipe.is_gluten_free,
        allergens: (recipe.allergens ?? []).join(", "),
      },
      ingredients: (ings ?? []).map((i: any) => ({
        id: i.id,
        name: i.name ?? "",
        quantity: i.quantity != null ? String(i.quantity) : "",
        unit: i.unit ?? "",
        cost_per_unit: i.cost_per_unit != null ? String(i.cost_per_unit) : "",
        notes: i.notes ?? "",
        inventory_item_id: i.inventory_item_id ?? null,
      })),
    };
    return { initial, recipeId: recipe.id };
  },
  component: EditPage,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="space-y-4 p-6">
        <p className="text-destructive">{error.message}</p>
        <div className="flex gap-2">
          <Button onClick={() => router.invalidate()} variant="outline">Retry</Button>
          <Link to="/admin/recipes"><Button>Back to Recipes</Button></Link>
        </div>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="space-y-4 p-6">
      <p>Recipe not found.</p>
      <Link to="/admin/recipes"><Button>Back to Recipes</Button></Link>
    </div>
  ),
});

function EditPage() {
  const { initial, recipeId } = Route.useLoaderData();
  return <RecipeForm mode="edit" initial={initial} recipeId={recipeId} />;
}
