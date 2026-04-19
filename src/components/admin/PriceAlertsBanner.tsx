import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPriceVolatilityAlerts } from "@/lib/server-fns/price-volatility.functions";
import { AlertTriangle, X, TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Alert = {
  ingredient_id: string;
  name: string;
  kind: "local_deviation" | "national_mom";
  details: string;
  severity: "warn" | "high";
};

export function PriceAlertsBanner() {
  const fetchAlerts = useServerFn(getPriceVolatilityAlerts);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const dismissedAt = sessionStorage.getItem("price_alerts_dismissed_at");
    if (dismissedAt && Date.now() - Number(dismissedAt) < 1000 * 60 * 60) {
      setDismissed(true);
    }
    fetchAlerts()
      .then((res: any) => setAlerts((res?.alerts || []) as Alert[]))
      .catch(() => setAlerts([]));
  }, [fetchAlerts]);

  if (dismissed || alerts.length === 0) return null;

  const high = alerts.filter((a) => a.severity === "high");
  const visible = expanded ? alerts.slice(0, 20) : alerts.slice(0, 3);

  const dismiss = () => {
    sessionStorage.setItem("price_alerts_dismissed_at", String(Date.now()));
    setDismissed(true);
  };

  return (
    <Card className="border-warning/40 bg-warning/5 shadow-warm">
      <div className="p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-warning/15 text-warning shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">
              {alerts.length} price {alerts.length === 1 ? "alert" : "alerts"} detected
            </p>
            {high.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">{high.length} high</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            National benchmark or local averages have shifted significantly.
          </p>
          <ul className="mt-3 space-y-1.5">
            {visible.map((a, i) => {
              const isUp = /↑|up|\+/i.test(a.details) || /\b\d+\.\d+%\)$/.test(a.details) && !a.details.includes("-");
              return (
                <li key={`${a.ingredient_id}-${i}`} className="text-xs flex items-start gap-2">
                  {isUp ? (
                    <TrendingUp className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                  )}
                  <span>
                    <span className="font-medium text-foreground">{a.name}</span>{" "}
                    <span className="text-muted-foreground">— {a.details}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {alerts.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-primary font-medium hover:underline"
            >
              {expanded ? "Show fewer" : `Show all ${Math.min(alerts.length, 20)}`}
            </button>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={dismiss} aria-label="Dismiss">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
