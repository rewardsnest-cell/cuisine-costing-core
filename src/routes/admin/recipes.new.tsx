import { createFileRoute } from "@tanstack/react-router";
import { RecipeForm, blankInitial } from "@/components/recipes/RecipeForm";

export const Route = createFileRoute("/admin/recipes/new")({
  component: () => <RecipeForm mode="create" initial={blankInitial} />,
});
