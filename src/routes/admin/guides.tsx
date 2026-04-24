import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/LoadingState";
import { Plus, BookOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/guides")({
  head: () => ({ meta: [{ title: "Cooking Guides — Admin" }] }),
  component: GuidesListPage,
});

type Guide = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  updated_at: string;
};

function GuidesListPage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    let q = supabase.from("cooking_guides").select("id,title,slug,status,updated_at").order("updated_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    else setGuides((data ?? []) as Guide[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleCreate = async () => {
    setCreating(true);
    const slug = `guide-${Date.now().toString(36)}`;
    const { data, error } = await supabase
      .from("cooking_guides")
      .insert({ title: "Untitled guide", slug, body: "", status: "draft" })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.message ?? "Could not create guide");
      return;
    }
    navigate({ to: "/admin/guides/$id", params: { id: data.id } });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Cooking Guides</h1>
          <p className="text-sm text-muted-foreground mt-1">Long-form how-to content. Separate from recipes — no pricing, no menus.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
            <Plus className="w-4 h-4" /> New guide
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading guides…" />
      ) : guides.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-foreground font-medium">No guides yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first cooking guide to get started.</p>
            <Button onClick={handleCreate} disabled={creating} className="mt-4 gap-1.5">
              <Plus className="w-4 h-4" /> New guide
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {guides.map((g) => (
                <Link
                  key={g.id}
                  to="/admin/guides/$id"
                  params={{ id: g.id }}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground truncate">{g.title || "Untitled"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">/{g.slug}</div>
                  </div>
                  <Badge variant={g.status === "published" ? "default" : "secondary"}>{g.status}</Badge>
                  <div className="text-xs text-muted-foreground tabular-nums hidden sm:block">
                    {new Date(g.updated_at).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
