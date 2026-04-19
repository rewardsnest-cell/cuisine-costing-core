import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link2, Globe2 } from "lucide-react";
import {
  getGlobalIngredientCoverage,
  getNationalPriceCoverage,
} from "@/lib/server-fns/ingredient-coverage.functions";

type Ing = Awaited<ReturnType<typeof getGlobalIngredientCoverage>>;
type Nat = Awaited<ReturnType<typeof getNationalPriceCoverage>>;

function tone(pct: number) {
  if (pct >= 90) return "bg-success/10 text-success border-success/30";
  if (pct >= 60) return "bg-warning/10 text-warning border-warning/30";
  return "bg-destructive/10 text-destructive border-destructive/30";
}

export function CoverageBadges() {
  const ingFn = useServerFn(getGlobalIngredientCoverage);
  const natFn = useServerFn(getNationalPriceCoverage);
  const [ing, setIng] = useState<Ing | null>(null);
  const [nat, setNat] = useState<Nat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [i, n] = await Promise.all([ingFn(), natFn()]);
        if (cancelled) return;
        setIng(i);
        setNat(n);
      } catch {
        /* swallow — badges are non-critical */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ingFn, natFn]);

  return (
    <Card className="shadow-warm border-border/50">
      <CardContent className="p-5 flex flex-wrap items-center gap-4">
        <Link
          to="/admin/ingredients/review-unlinked"
          className="flex items-center gap-3 group"
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Ingredient coverage</p>
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-bold tabular-nums">
                {loading || !ing ? "…" : `${ing.pct}%`}
              </span>
              {ing && (
                <Badge variant="outline" className={tone(ing.pct)}>
                  {ing.linked}/{ing.total} linked
                </Badge>
              )}
            </div>
          </div>
        </Link>

        <div className="hidden sm:block w-px h-10 bg-border" />

        <Link
          to="/admin/pricing/national"
          className="flex items-center gap-3 group"
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent/20 text-accent-foreground">
            <Globe2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              National price coverage{nat?.activeMonth ? ` · ${nat.activeMonth}` : ""}
            </p>
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-bold tabular-nums">
                {loading || !nat ? "…" : `${nat.pct}%`}
              </span>
              {nat && (
                <Badge variant="outline" className={tone(nat.pct)}>
                  {nat.covered}/{nat.total} priced
                </Badge>
              )}
            </div>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
