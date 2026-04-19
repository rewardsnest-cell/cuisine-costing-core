import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles } from "lucide-react";
import { UnlinkedIngredientsReview } from "@/components/recipes/UnlinkedIngredientsReview";

export const Route = createFileRoute("/admin/ingredients/review-unlinked")({
  head: () => ({
    meta: [
      { title: "Review Unlinked Ingredients — VPS Finest" },
      { name: "description", content: "Manually link, dismiss, or create canonical ingredients for unlinked entries." },
    ],
  }),
  component: ReviewUnlinkedPage,
});

function ReviewUnlinkedPage() {
  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="w-4 h-4" /> Back to Admin
          </Link>
          <h1 className="font-display text-2xl font-bold">Review Unlinked Ingredients</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Manually link raw ingredient text to canonical ingredients. Manual decisions are permanent and override automation.
          </p>
        </div>
        <Link to="/admin/auto-link-ingredients">
          <Button variant="outline" className="gap-2">
            <Sparkles className="w-4 h-4" />
            Auto-Link Ingredients
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unlinked items</CardTitle>
        </CardHeader>
        <CardContent>
          <UnlinkedIngredientsReview />
        </CardContent>
      </Card>
    </div>
  );
}
