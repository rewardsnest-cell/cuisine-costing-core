import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Info } from "lucide-react";
import {
  HEALTH_BADGE_CLASS,
  HEALTH_LABEL,
  fixHintForCheck,
  type HealthCheck,
  type RecipePricingHealth,
} from "@/lib/pricing-health";

interface Props {
  recipeId: string;
}

export function PricingHealthPanel({ recipeId }: Props) {
  const [health, setHealth] = useState<RecipePricingHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (supabase as any)
      .rpc("recipe_pricing_health", { _recipe_id: recipeId })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setHealth(data as RecipePricingHealth);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Computing pricing health…
        </CardContent>
      </Card>
    );
  }

  if (error || !health) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-5 text-sm text-destructive">
          Could not compute pricing health: {error || "unknown error"}
        </CardContent>
      </Card>
    );
  }

  const status = health.health_status;
  const overallIcon =
    status === "healthy" ? (
      <CheckCircle2 className="w-5 h-5 text-success" />
    ) : status === "warning" ? (
      <AlertTriangle className="w-5 h-5 text-warning" />
    ) : (
      <XCircle className="w-5 h-5 text-destructive" />
    );

  return (
    <Card className="shadow-warm border-border/50">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {overallIcon}
            <h2 className="font-display text-lg font-semibold">Pricing Health</h2>
          </div>
          <Badge className={HEALTH_BADGE_CLASS[status]}>{HEALTH_LABEL[status]}</Badge>
        </div>

        <p className="text-xs text-muted-foreground -mt-1">
          {status === "blocked"
            ? "This recipe is not safe to quote until all blocking checks pass."
            : status === "warning"
              ? "Recipe can be quoted, but admin-side warnings exist."
              : "All checks pass. Safe to quote."}
        </p>

        <ul className="space-y-2">
          {health.checks.map((check) => (
            <CheckRow key={check.key} check={check} />
          ))}
        </ul>

        <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-md p-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Health is derived from ingredient links, units, density, waste, price source, and freshness ({health.freshness_days}-day threshold).
            It cannot be edited directly — fix the underlying data and recompute.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckRow({ check }: { check: HealthCheck }) {
  const failed = !check.passed;
  const isWarn = check.severity === "warn";
  const Icon = !failed ? CheckCircle2 : isWarn ? AlertTriangle : XCircle;
  const color = !failed
    ? "text-success"
    : isWarn
      ? "text-warning"
      : "text-destructive";

  return (
    <li className="flex items-start gap-3">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{check.label}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {check.count_ok}/{check.count_total}
            {check.key === "freshness" && check.threshold_days
              ? ` · ${check.threshold_days}d`
              : ""}
          </span>
          {failed && (
            <Badge variant="outline" className={`text-[10px] ${color}`}>
              {isWarn ? "warning" : "blocking"}
            </Badge>
          )}
        </div>
        {failed && check.errors.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {check.errors.slice(0, 6).map((err, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{err.ingredient || "—"}</span>
                {err.message ? `: ${err.message}` : ""}
              </li>
            ))}
            {check.errors.length > 6 && (
              <li className="text-xs text-muted-foreground italic">
                …and {check.errors.length - 6} more
              </li>
            )}
          </ul>
        )}
        {failed && (
          <p className="text-[11px] text-muted-foreground mt-1 italic">
            {fixHintForCheck(check.key)}
          </p>
        )}
      </div>
    </li>
  );
}
