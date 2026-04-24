import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Sparkles, BookOpen, Activity, MessageSquare, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/review-inbox")({
  head: () => ({
    meta: [
      { title: "Review Inbox — Admin" },
      { name: "description", content: "Centralized inbox of admin items needing review." },
    ],
  }),
  component: ReviewInboxPage,
});

type CardDef = {
  key: string;
  title: string;
  description: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  fetchCount: () => Promise<number>;
};

const CARDS: CardDef[] = [
  {
    key: "auto-link",
    title: "Ingredient Auto-Linking",
    description: "Recipe ingredients without a canonical reference link.",
    to: "/admin/auto-link-ingredients",
    icon: Sparkles,
    fetchCount: async () => {
      const { count } = await supabase
        .from("recipe_ingredients")
        .select("id", { count: "exact", head: true })
        .is("reference_id", null);
      return count ?? 0;
    },
  },
  {
    key: "unlinked",
    title: "Unlinked Ingredients",
    description: "Review ingredients that couldn't be matched automatically.",
    to: "/admin/ingredients/review-unlinked",
    icon: Link2,
    fetchCount: async () => {
      const { count } = await supabase
        .from("recipe_ingredients")
        .select("id", { count: "exact", head: true })
        .is("reference_id", null);
      return count ?? 0;
    },
  },
  {
    key: "servings",
    title: "Servings Review",
    description: "Recipes with missing or suspicious serving sizes.",
    to: "/admin/servings-review",
    icon: Activity,
    fetchCount: async () => {
      const { count } = await supabase
        .from("recipes")
        .select("id", { count: "exact", head: true })
        .or("servings.is.null,servings.eq.0");
      return count ?? 0;
    },
  },
  {
    key: "synonyms",
    title: "Synonyms Review",
    description: "Pending ingredient synonym suggestions awaiting review.",
    to: "/admin/synonyms",
    icon: BookOpen,
    fetchCount: async () => {
      const { count } = await supabase
        .from("ingredient_synonyms")
        .select("id", { count: "exact", head: true })
        .eq("source", "auto");
      return count ?? 0;
    },
  },
  {
    key: "feedback",
    title: "Feedback",
    description: "New user feedback submissions to triage.",
    to: "/admin/feedback",
    icon: MessageSquare,
    fetchCount: async () => {
      const { count } = await supabase
        .from("feedback")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      return count ?? 0;
    },
  },
];

function ReviewInboxPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Review Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Centralized view of items needing admin attention. This page is read-only — open a tool to take action.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((card) => (
          <ReviewCard key={card.key} card={card} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ card }: { card: CardDef }) {
  const { data: count, isLoading, isError } = useQuery({
    queryKey: ["review-inbox-count", card.key],
    queryFn: card.fetchCount,
    staleTime: 60_000,
  });

  const Icon = card.icon;

  return (
    <Link to={card.to} className="group block">
      <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/30">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-4.5 h-4.5 text-primary" />
              </div>
              <CardTitle className="text-base">{card.title}</CardTitle>
            </div>
            <Badge variant={count && count > 0 ? "default" : "secondary"} className="shrink-0">
              {isLoading ? "…" : isError ? "—" : `${count ?? 0} pending`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription>{card.description}</CardDescription>
          <div className="mt-4 flex items-center text-sm font-medium text-primary group-hover:underline">
            Open tool <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
