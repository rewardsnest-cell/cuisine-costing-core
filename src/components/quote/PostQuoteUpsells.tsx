import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Check } from "lucide-react";
import { ADDONS, SIDES_AND_EXTRAS } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type UpsellSource = { id: string; label: string; price: number; icon: string; desc?: string };

interface Suggestion extends UpsellSource {
  reason: string;
  source: "extra" | "addon";
}

interface Props {
  quoteId: string;
  guestCount: number;
  eventType: string | null;
  selectedExtras: string[];
  selectedAddons: string[];
  onAdded?: () => void;
}

/**
 * Smart, context-aware upsells shown after quote submission.
 * Suggests popular add-ons the user hasn't already chosen, framed as
 * social proof ("Most couples in Aurora add…").
 */
export function PostQuoteUpsells({
  quoteId,
  guestCount,
  eventType,
  selectedExtras,
  selectedAddons,
  onAdded,
}: Props) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  const suggestions = useMemo<Suggestion[]>(() => {
    const lowerType = (eventType || "").toLowerCase();
    const isWedding = /wedding|reception|engagement/.test(lowerType);
    const isCorporate = /corporate|office|business|meeting/.test(lowerType);
    const isParty = /party|birthday|anniversary|holiday|graduation/.test(lowerType);

    const out: Suggestion[] = [];
    const seen = new Set<string>();

    const push = (src: UpsellSource, source: "extra" | "addon", reason: string) => {
      if (seen.has(`${source}:${src.id}`)) return;
      seen.add(`${source}:${src.id}`);
      out.push({ ...src, source, reason });
    };

    const findExtra = (id: string) => SIDES_AND_EXTRAS.find((e) => e.id === id);
    const findAddon = (id: string) => ADDONS.find((a) => a.id === id);

    if (isWedding) {
      const apps = findExtra("appetizers");
      if (apps && !selectedExtras.includes("appetizers")) {
        push(apps, "extra", "Most couples in Aurora add a charcuterie & appetizer course for cocktail hour");
      }
      const bar = findAddon("bar_premium");
      if (bar && !selectedAddons.includes("bar_premium") && !selectedAddons.includes("bar_basic")) {
        push(bar, "addon", "9 of 10 weddings include a premium bar package — guests remember it");
      }
      const florals = findAddon("florals");
      if (florals && !selectedAddons.includes("florals")) {
        push(florals, "addon", "Fresh seasonal centerpieces complete the table for almost every wedding");
      }
    }

    if (isCorporate) {
      const coffee = findExtra("coffee");
      if (coffee && !selectedExtras.includes("coffee")) {
        push(coffee, "extra", "Coffee & tea service is a near-universal add-on for corporate events");
      }
      const bev = findExtra("beverages");
      if (bev && !selectedExtras.includes("beverages")) {
        push(bev, "extra", "Most office groups add non-alcoholic beverages for the full team");
      }
    }

    if (isParty) {
      const dessert = findExtra("dessert");
      if (dessert && !selectedExtras.includes("dessert")) {
        push(dessert, "extra", "A dessert course is the most-loved add-on at celebrations");
      }
      const bar = findAddon("bar_basic");
      if (bar && !selectedAddons.includes("bar_basic") && !selectedAddons.includes("bar_premium")) {
        push(bar, "addon", "A basic bar package keeps the room lively without overdoing it");
      }
    }

    // Universal fallbacks if nothing matched yet
    if (out.length < 2) {
      const dessert = findExtra("dessert");
      if (dessert && !selectedExtras.includes("dessert")) {
        push(dessert, "extra", "A dessert course is one of our most-added items across every event type");
      }
      const staff = findAddon("staff");
      if (staff && !selectedAddons.includes("staff")) {
        push(staff, "addon", "Adding extra wait staff keeps service smooth as guest counts grow");
      }
    }

    return out.slice(0, 3);
  }, [eventType, selectedExtras, selectedAddons]);

  if (suggestions.length === 0) return null;

  const handleAdd = async (s: Suggestion) => {
    setPending(s.id);
    try {
      const total = s.price * guestCount;
      const { error } = await (supabase as any).from("quote_items").insert({
        quote_id: quoteId,
        name: s.label,
        quantity: guestCount,
        unit_price: s.price,
        total_price: total,
      });
      if (error) throw error;
      setAccepted((prev) => new Set(prev).add(s.id));
      toast.success(`Added ${s.label}`, { description: `+$${total.toLocaleString()} for ${guestCount} guests` });
      onAdded?.();
    } catch (e: any) {
      toast.error("Couldn't add that just yet", { description: e.message });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="text-left mt-8 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="font-display text-lg font-semibold text-foreground">You might also love</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Based on your event, here's what most hosts in Northeast Ohio add. Tap to include — we'll update your proposal.
      </p>
      <div className="space-y-2">
        {suggestions.map((s) => {
          const isAccepted = accepted.has(s.id);
          const cost = s.price * guestCount;
          return (
            <Card key={`${s.source}-${s.id}`} className={isAccepted ? "border-success/50 bg-success/5" : ""}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="text-2xl shrink-0 leading-none mt-0.5">{s.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm text-foreground truncate">{s.label}</p>
                    <span className="text-xs font-medium text-foreground tabular-nums shrink-0">
                      +${cost.toLocaleString()}
                      <span className="text-muted-foreground font-normal"> · ${s.price}/guest</span>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.reason}</p>
                </div>
                <Button
                  size="sm"
                  variant={isAccepted ? "secondary" : "outline"}
                  className="shrink-0"
                  onClick={() => !isAccepted && handleAdd(s)}
                  disabled={isAccepted || pending === s.id}
                >
                  {isAccepted ? (
                    <><Check className="w-3 h-3" /> Added</>
                  ) : pending === s.id ? (
                    "Adding…"
                  ) : (
                    <><Plus className="w-3 h-3" /> Add</>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
