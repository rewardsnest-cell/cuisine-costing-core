import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChefHat, Video, ShoppingBag, Search, Plus, Pencil } from "lucide-react";
import { parseYouTubeId } from "@/lib/recipe-video";

export const Route = createFileRoute("/admin/recipe-hub")({
  head: () => ({ meta: [{ title: "Recipe Hub — Admin" }] }),
  component: RecipeHub,
});

type Row = {
  id: string;
  name: string;
  active: boolean;
  category: string | null;
  use_case: string | null;
  image_url: string | null;
  video_url: string | null;
  pro_tips: any;
  score_affiliate: number;
  score_video: number;
  score_event: number;
  score_seasonal: number;
  shop_count?: number;
};

function RecipeHub() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "no-video" | "no-shop" | "draft">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: recipes }, { data: shop }] = await Promise.all([
        (supabase as any)
          .from("recipes")
          .select("id, name, active, category, use_case, image_url, video_url, pro_tips, score_affiliate, score_video, score_event, score_seasonal")
          .order("updated_at", { ascending: false }),
        (supabase as any).from("recipe_shop_items").select("recipe_id"),
      ]);
      const counts = new Map<string, number>();
      for (const s of (shop || []) as any[]) counts.set(s.recipe_id, (counts.get(s.recipe_id) || 0) + 1);
      const merged: Row[] = (recipes || []).map((r: any) => ({ ...r, shop_count: counts.get(r.id) || 0 }));
      setRows(merged);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const withVideo = rows.filter((r) => parseYouTubeId(r.video_url)).length;
    const withShop = rows.filter((r) => (r.shop_count || 0) > 0).length;
    const drafts = rows.filter((r) => !r.active).length;
    return { total, withVideo, withShop, drafts };
  }, [rows]);

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ql && !r.name.toLowerCase().includes(ql)) return false;
      if (filter === "no-video" && parseYouTubeId(r.video_url)) return false;
      if (filter === "no-shop" && (r.shop_count || 0) > 0) return false;
      if (filter === "draft" && r.active) return false;
      return true;
    });
  }, [rows, q, filter]);

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-primary">Recipe Hub</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Centralized control for video, monetization, and content quality across all recipes.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/recipes/new"><Button><Plus className="w-4 h-4 mr-2" />New recipe</Button></Link>
          <Link to="/recipes" target="_blank"><Button variant="outline">View public hub</Button></Link>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total recipes" value={stats.total} icon={<ChefHat className="w-4 h-4" />} />
        <Stat label="With video" value={`${stats.withVideo} / ${stats.total}`} icon={<Video className="w-4 h-4" />} />
        <Stat label="With shop items" value={`${stats.withShop} / ${stats.total}`} icon={<ShoppingBag className="w-4 h-4" />} />
        <Stat label="Drafts (inactive)" value={stats.drafts} />
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes…" className="pl-9" />
          </div>
          <div className="inline-flex rounded-full border border-border bg-card p-1 text-sm">
            {([
              ["all", "All"],
              ["no-video", "Missing video"],
              ["no-shop", "Missing shop items"],
              ["draft", "Drafts"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1 rounded-full transition-colors ${filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground">No recipes match.</p>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left">
              <tr>
                <th className="px-4 py-2">Recipe</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Video</th>
                <th className="px-4 py-2">Shop</th>
                <th className="px-4 py-2">Tips</th>
                <th className="px-4 py-2">Scores (A/V/E/S)</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const tipCount = Array.isArray(r.pro_tips) ? r.pro_tips.length : 0;
                const hasVideo = !!parseYouTubeId(r.video_url);
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/20">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        {r.image_url ? (
                          <img src={r.image_url} className="w-10 h-10 rounded object-cover" alt="" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted" />
                        )}
                        <div>
                          <p className="font-medium text-foreground">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{[r.category, r.use_case].filter(Boolean).join(" · ") || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {r.active ? <Badge variant="secondary">Published</Badge> : <Badge variant="outline">Draft</Badge>}
                    </td>
                    <td className="px-4 py-2">{hasVideo ? <Badge>YouTube</Badge> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2">
                      {(r.shop_count || 0) > 0 ? <Badge variant="secondary">{r.shop_count}</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      {tipCount >= 3 ? <Badge variant="secondary">{tipCount}</Badge> : <span className="text-muted-foreground">{tipCount}/3</span>}
                    </td>
                    <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">
                      {r.score_affiliate}/{r.score_video}/{r.score_event}/{r.score_seasonal}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Link to="/admin/recipe-hub/$id" params={{ id: r.id }}>
                          <Button size="sm" variant="outline"><Pencil className="w-3 h-3 mr-1" />Hub</Button>
                        </Link>
                        <Link to="/admin/recipes/$id/edit" params={{ id: r.id }}>
                          <Button size="sm" variant="ghost">Recipe</Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-display text-foreground mt-2">{value}</p>
      </CardContent>
    </Card>
  );
}
