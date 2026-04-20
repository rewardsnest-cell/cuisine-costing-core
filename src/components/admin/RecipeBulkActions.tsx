import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { generateRecipePhoto } from "@/lib/server/generate-recipe-photos";
import { Button } from "@/components/ui/button";
import { Sparkles, Link2, Loader2, ImageOff, X } from "lucide-react";
import { toast } from "sonner";

interface BulkRecipe {
  id: string;
  name: string;
  image_url?: string | null;
}

interface Props {
  recipes: BulkRecipe[];
  selectedIds: Set<string>;
  onClearSelection: () => void;
  onPhotoUpdated?: (recipeId: string, url: string) => void;
}

/**
 * Floating bulk-action bar. Shows when ≥1 recipe is selected.
 * Actions:
 *   • Generate missing photos — runs existing generateRecipePhoto server fn for selected recipes that have no image_url.
 *   • Auto-link ingredients — opens the dedicated page (works across all unlinked, not per-recipe).
 */
export function RecipeBulkActions({ recipes, selectedIds, onClearSelection, onPhotoUpdated }: Props) {
  const gen = useServerFn(generateRecipePhoto);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  if (selectedIds.size === 0) return null;

  const selectedRecipes = recipes.filter((r) => selectedIds.has(r.id));
  const missingPhotos = selectedRecipes.filter((r) => !r.image_url);

  const generatePhotos = async () => {
    if (missingPhotos.length === 0) {
      toast.info("All selected recipes already have photos.");
      return;
    }
    if (!confirm(`Generate AI photos for ${missingPhotos.length} recipe(s)? Runs 4 in parallel.`)) return;
    setRunning(true);
    setProgress({ done: 0, total: missingPhotos.length, failed: 0 });

    const CONCURRENCY = 4;
    const queue = [...missingPhotos];
    let ok = 0;
    let fail = 0;
    let done = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const r = queue.shift();
        if (!r) break;
        try {
          const out: any = await gen({ data: { recipeId: r.id } });
          ok++;
          onPhotoUpdated?.(r.id, out?.url);
        } catch {
          fail++;
        }
        done++;
        setProgress({ done, total: missingPhotos.length, failed: fail });
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missingPhotos.length) }, worker));
    setRunning(false);
    toast.success(`Photos: ${ok} generated${fail > 0 ? `, ${fail} failed` : ""}`);
  };

  return (
    <div className="sticky bottom-4 z-30 mx-auto max-w-3xl">
      <div className="rounded-xl border border-primary/30 bg-card shadow-gold p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 mr-auto">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {selectedIds.size}
          </span>
          <span className="text-sm font-medium">selected</span>
          {missingPhotos.length > 0 && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <ImageOff className="w-3.5 h-3.5" /> {missingPhotos.length} missing photo
            </span>
          )}
          {running && (
            <span className="text-xs text-muted-foreground">
              {progress.done}/{progress.total}{progress.failed > 0 ? ` · ${progress.failed} failed` : ""}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={generatePhotos} disabled={running} className="gap-1.5">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Generate missing photos
        </Button>
        <Link to="/admin/auto-link-ingredients">
          <Button size="sm" variant="outline" className="gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            Auto-link ingredients
          </Button>
        </Link>
        <Button size="sm" variant="ghost" onClick={onClearSelection} className="gap-1" disabled={running}>
          <X className="w-3.5 h-3.5" /> Clear
        </Button>
      </div>
    </div>
  );
}
