import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/LoadingState";
import { ArrowLeft, Save, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/guides/$id")({
  head: () => ({ meta: [{ title: "Edit Cooking Guide — Admin" }] }),
  component: GuideEditPage,
});

type Guide = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  body: string;
  related_ingredients: string[];
  related_tools: string[];
  updated_at: string;
  published_at: string | null;
};

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || `guide-${Date.now().toString(36)}`;
}

function GuideEditPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ingredientsText, setIngredientsText] = useState("");
  const [toolsText, setToolsText] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("cooking_guides").select("*").eq("id", id).maybeSingle();
      if (error) toast.error(error.message);
      else if (data) {
        const g = data as unknown as Guide;
        setGuide(g);
        setIngredientsText((g.related_ingredients ?? []).join("\n"));
        setToolsText((g.related_tools ?? []).join("\n"));
      }
      setLoading(false);
    })();
  }, [id]);

  const update = (patch: Partial<Guide>) => setGuide((g) => (g ? { ...g, ...patch } : g));

  const save = async (overrides: Partial<Guide> = {}) => {
    if (!guide) return;
    setSaving(true);
    const payload = {
      title: guide.title,
      slug: guide.slug || slugify(guide.title),
      body: guide.body,
      status: guide.status,
      related_ingredients: ingredientsText.split("\n").map((l) => l.trim()).filter(Boolean),
      related_tools: toolsText.split("\n").map((l) => l.trim()).filter(Boolean),
      ...overrides,
    };
    const { error } = await supabase.from("cooking_guides").update(payload).eq("id", guide.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Saved");
    setGuide({ ...guide, ...payload, updated_at: new Date().toISOString() });
    return true;
  };

  const togglePublish = async () => {
    if (!guide) return;
    const next = guide.status === "published" ? "draft" : "published";
    if (next === "published") {
      if (!guide.title.trim()) return toast.error("Title is required to publish");
      if (!guide.body.trim()) return toast.error("Body content is required to publish");
    }
    const ok = await save({ status: next });
    if (ok) toast.success(next === "published" ? "Published" : "Reverted to draft");
  };

  const remove = async () => {
    if (!guide) return;
    if (!confirm("Delete this guide? This cannot be undone.")) return;
    const { error } = await supabase.from("cooking_guides").delete().eq("id", guide.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      navigate({ to: "/admin/guides" });
    }
  };

  if (loading) return <LoadingState label="Loading guide…" />;
  if (!guide) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-foreground font-medium">Guide not found</p>
        <Link to="/admin/guides"><Button variant="outline" className="mt-4">Back to guides</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link to="/admin/guides" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> All guides
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant={guide.status === "published" ? "default" : "secondary"}>{guide.status}</Badge>
          <Button variant="outline" size="sm" onClick={togglePublish} disabled={saving} className="gap-1.5">
            {guide.status === "published" ? <><EyeOff className="w-4 h-4" /> Unpublish</> : <><Eye className="w-4 h-4" /> Publish</>}
          </Button>
          <Button size="sm" onClick={() => save()} disabled={saving} className="gap-1.5">
            <Save className="w-4 h-4" /> Save
          </Button>
          <Button variant="ghost" size="sm" onClick={remove} className="text-destructive gap-1.5">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={guide.title}
              onChange={(e) => {
                const title = e.target.value;
                update({ title, slug: guide.slug && guide.slug !== slugify(guide.title) ? guide.slug : slugify(title) });
              }}
              placeholder="How to sear a steak"
            />
          </div>
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" value={guide.slug} onChange={(e) => update({ slug: slugify(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="body">Body (Markdown)</Label>
            <Textarea
              id="body"
              value={guide.body}
              onChange={(e) => update({ body: e.target.value })}
              rows={16}
              placeholder="## Step 1&#10;..."
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold">References (optional)</h2>
          <p className="text-xs text-muted-foreground -mt-2">Reference-only. Does not affect pricing, menus, or quotes.</p>
          <div>
            <Label htmlFor="ings">Related ingredients (one per line)</Label>
            <Textarea id="ings" value={ingredientsText} onChange={(e) => setIngredientsText(e.target.value)} rows={4} placeholder="Kosher salt&#10;Olive oil" />
          </div>
          <div>
            <Label htmlFor="tools">Related tools / equipment (one per line)</Label>
            <Textarea id="tools" value={toolsText} onChange={(e) => setToolsText(e.target.value)} rows={4} placeholder="Cast iron skillet&#10;Tongs" />
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Last updated {new Date(guide.updated_at).toLocaleString()}
        {guide.published_at && <> · Published {new Date(guide.published_at).toLocaleString()}</>}
      </div>
    </div>
  );
}
