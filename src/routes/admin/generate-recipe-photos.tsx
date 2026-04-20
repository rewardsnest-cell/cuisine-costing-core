import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listRecipesForPhotoGen, generateRecipePhoto, generateRecipeSocialPhoto } from "@/lib/server/generate-recipe-photos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, CheckCircle2, XCircle, Share2 } from "lucide-react";
import { toast } from "sonner";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/generate-recipe-photos")({
  head: () => ({ meta: [{ title: "Generate Recipe Photos — Admin" }] }),
  component: Page,
});

type Recipe = { id: string; name: string; image_url: string | null; social_image_url: string | null };
type Status = "pending" | "running" | "done" | "error";
type Row = Recipe & { status: Status; socialStatus: Status; newUrl?: string; newSocialUrl?: string; error?: string; socialError?: string };

function Page() {
  const list = useServerFn(listRecipesForPhotoGen);
  const gen = useServerFn(generateRecipePhoto);
  const genSocial = useServerFn(generateRecipeSocialPhoto);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);

  useEffect(() => {
    list().then((r) => setRows(r.recipes.map((x) => ({ ...x, status: "pending" as Status, socialStatus: "pending" as Status }))));
  }, [list]);

  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "error").length;
  const total = rows.length;

  const socialDone = rows.filter((r) => r.socialStatus === "done").length;
  const socialFailed = rows.filter((r) => r.socialStatus === "error").length;
  const missingCount = rows.filter((r) => !r.image_url || r.status === "error").length;
  const missingSocialCount = rows.filter((r) => !r.social_image_url || r.socialStatus === "error").length;

  const runFiltered = async (predicate: (r: Row) => boolean) => {
    setRunning(true);
    setStopRequested(false);
    let okCount = 0;
    let errCount = 0;
    for (let i = 0; i < rows.length; i++) {
      if (stopRequested) break;
      const r = rows[i];
      if (!predicate(r)) continue;
      if (r.status === "done") continue;
      setRows((s) => s.map((x, idx) => (idx === i ? { ...x, status: "running" } : x)));
      try {
        const out = await gen({ data: { recipeId: r.id } });
        okCount++;
        setRows((s) => s.map((x, idx) => (idx === i ? { ...x, status: "done", newUrl: out.url, image_url: out.url } : x)));
      } catch (e: any) {
        errCount++;
        setRows((s) => s.map((x, idx) => (idx === i ? { ...x, status: "error", error: e?.message || "failed" } : x)));
      }
    }
    setRunning(false);
    toast.success(`Finished — ${okCount} done, ${errCount} failed`);
  };

  const runFilteredSocial = async (predicate: (r: Row) => boolean) => {
    setRunning(true);
    setStopRequested(false);
    let okCount = 0;
    let errCount = 0;
    for (let i = 0; i < rows.length; i++) {
      if (stopRequested) break;
      const r = rows[i];
      if (!predicate(r)) continue;
      if (r.socialStatus === "done") continue;
      setRows((s) => s.map((x, idx) => (idx === i ? { ...x, socialStatus: "running", socialError: undefined } : x)));
      try {
        const out = await genSocial({ data: { recipeId: r.id } });
        okCount++;
        setRows((s) => s.map((x, idx) => (idx === i ? { ...x, socialStatus: "done", newSocialUrl: out.url, social_image_url: out.url } : x)));
      } catch (e: any) {
        errCount++;
        setRows((s) => s.map((x, idx) => (idx === i ? { ...x, socialStatus: "error", socialError: e?.message || "failed" } : x)));
      }
    }
    setRunning(false);
    toast.success(`Social — ${okCount} done, ${errCount} failed`);
  };

  const runAll = () => runFiltered(() => true);
  const runMissing = () => runFiltered((r) => !r.image_url || r.status === "error");
  const runAllSocial = () => runFilteredSocial(() => true);
  const runMissingSocial = () => runFilteredSocial((r) => !r.social_image_url || r.socialStatus === "error");

  const regenerateOne = async (id: string) => {
    const i = rows.findIndex((x) => x.id === id);
    if (i < 0) return;
    setRows((s) => s.map((x, idx) => (idx === i ? { ...x, status: "running", error: undefined } : x)));
    try {
      const out = await gen({ data: { recipeId: id } });
      setRows((s) => s.map((x, idx) => (idx === i ? { ...x, status: "done", newUrl: out.url, image_url: out.url } : x)));
    } catch (e: any) {
      setRows((s) => s.map((x, idx) => (idx === i ? { ...x, status: "error", error: e?.message || "failed" } : x)));
    }
  };

  const regenerateSocialOne = async (id: string) => {
    const i = rows.findIndex((x) => x.id === id);
    if (i < 0) return;
    setRows((s) => s.map((x, idx) => (idx === i ? { ...x, socialStatus: "running", socialError: undefined } : x)));
    try {
      const out = await genSocial({ data: { recipeId: id } });
      setRows((s) => s.map((x, idx) => (idx === i ? { ...x, socialStatus: "done", newSocialUrl: out.url, social_image_url: out.url } : x)));
    } catch (e: any) {
      setRows((s) => s.map((x, idx) => (idx === i ? { ...x, socialStatus: "error", socialError: e?.message || "failed" } : x)));
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHelpCard route="/admin/generate-recipe-photos" />
      <div>
        <h2 className="font-display text-2xl font-bold">Generate Recipe Photos</h2>
        <p className="text-sm text-muted-foreground">
          AI-generates editorial-style hero photos and clean social-share images (no text, coupons, or buttons) for every active recipe.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Editorial hero photos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={runAll} disabled={running || rows.length === 0} className="bg-gradient-warm text-primary-foreground">
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {running ? `Generating (${done}/${total})...` : `Generate all ${total} photos`}
            </Button>
            <Button onClick={runMissing} disabled={running || missingCount === 0} variant="secondary">
              <Sparkles className="w-4 h-4 mr-2" />
              Regenerate missing/failed ({missingCount})
            </Button>
            {running && (
              <Button variant="outline" onClick={() => setStopRequested(true)}>Stop after current</Button>
            )}
          </div>
          {total > 0 && <Progress value={(done / total) * 100} />}
          <p className="text-xs text-muted-foreground">{done} done · {failed} failed · {total - done - failed} remaining</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Share2 className="w-5 h-5" /> Social share images (no coupons / buttons)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={runAllSocial} disabled={running || rows.length === 0} className="bg-gradient-warm text-primary-foreground">
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />}
              {running ? `Generating (${socialDone}/${total})...` : `Generate all ${total} social images`}
            </Button>
            <Button onClick={runMissingSocial} disabled={running || missingSocialCount === 0} variant="secondary">
              <Share2 className="w-4 h-4 mr-2" />
              Regenerate missing/failed ({missingSocialCount})
            </Button>
          </div>
          {total > 0 && <Progress value={(socialDone / total) * 100} />}
          <p className="text-xs text-muted-foreground">{socialDone} done · {socialFailed} failed · {total - socialDone - socialFailed} remaining</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border overflow-hidden bg-card">
            <div className="grid grid-cols-2">
              <div className="aspect-square bg-muted relative border-r">
                {r.image_url ? (
                  <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">no hero</div>
                )}
                {r.status === "running" && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                )}
                {r.status === "done" && (
                  <div className="absolute top-1 right-1 bg-background rounded-full p-0.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                )}
                {r.status === "error" && (
                  <div className="absolute top-1 right-1 bg-background rounded-full p-0.5">
                    <XCircle className="w-4 h-4 text-destructive" />
                  </div>
                )}
                <span className="absolute bottom-1 left-1 text-[9px] uppercase tracking-wide bg-background/80 px-1 rounded">Hero</span>
              </div>
              <div className="aspect-square bg-muted relative">
                {r.social_image_url ? (
                  <img src={r.social_image_url} alt={`${r.name} social`} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">no social</div>
                )}
                {r.socialStatus === "running" && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                )}
                {r.socialStatus === "done" && (
                  <div className="absolute top-1 right-1 bg-background rounded-full p-0.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                )}
                {r.socialStatus === "error" && (
                  <div className="absolute top-1 right-1 bg-background rounded-full p-0.5">
                    <XCircle className="w-4 h-4 text-destructive" />
                  </div>
                )}
                <span className="absolute bottom-1 left-1 text-[9px] uppercase tracking-wide bg-background/80 px-1 rounded">Social</span>
              </div>
            </div>
            <div className="p-2 space-y-1">
              <p className="text-sm font-medium truncate" title={r.name}>{r.name}</p>
              {r.error && <p className="text-[10px] text-destructive truncate" title={r.error}>Hero: {r.error}</p>}
              {r.socialError && <p className="text-[10px] text-destructive truncate" title={r.socialError}>Social: {r.socialError}</p>}
              <div className="grid grid-cols-2 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={running || r.status === "running"}
                  onClick={() => regenerateOne(r.id)}
                >
                  {r.status === "running" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                  Hero
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={running || r.socialStatus === "running"}
                  onClick={() => regenerateSocialOne(r.id)}
                >
                  {r.socialStatus === "running" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Share2 className="w-3 h-3 mr-1" />}
                  Social
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
