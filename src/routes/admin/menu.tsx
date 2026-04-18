import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, ChefHat, ImageOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/menu")({
  head: () => ({
    meta: [{ title: "Public Menu — Admin" }],
  }),
  component: AdminMenuPage,
});

type MenuRecipe = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  cost_per_serving: number | null;
  menu_price: number | null;
  active: boolean;
  is_standard: boolean;
  is_premium: boolean;
};

const MARKUP = 3.5;

function resolvedPrice(r: Pick<MenuRecipe, "menu_price" | "cost_per_serving">) {
  if (r.menu_price != null && Number(r.menu_price) > 0) return Number(r.menu_price);
  return Number(r.cost_per_serving || 0) * MARKUP;
}

function AdminMenuPage() {
  const [recipes, setRecipes] = useState<MenuRecipe[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("recipes")
      .select("id, name, description, category, image_url, cost_per_serving, menu_price, active, is_standard, is_premium")
      .order("name");
    if (error) {
      toast.error(error.message);
    } else {
      setRecipes((data || []) as MenuRecipe[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())),
    [recipes, search],
  );

  const updateRecipe = async (id: string, patch: Partial<MenuRecipe>) => {
    setSavingId(id);
    setRecipes((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await (supabase as any).from("recipes").update(patch).eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      load();
    }
  };

  const commitPrice = async (id: string) => {
    const raw = priceDrafts[id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (Number.isNaN(next as number) || (next as number) < 0)) {
      toast.error("Enter a valid non-negative price, or leave blank for auto.");
      return;
    }
    await updateRecipe(id, { menu_price: next as any });
    setPriceDrafts((d) => {
      const { [id]: _, ...rest } = d;
      return rest;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Public Menu</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control which recipes appear on the public menu page, set per-person prices, and assign Standard / Premium badges.
          Price falls back to <span className="font-medium">cost × {MARKUP}</span> when left blank.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading recipes…</p>
      ) : filtered.length === 0 ? (
        <Card className="shadow-warm border-border/50">
          <CardContent className="p-12 text-center">
            <ChefHat className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No recipes found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => {
            const auto = Number(r.cost_per_serving || 0) * MARKUP;
            const effective = resolvedPrice(r);
            const draft = priceDrafts[r.id];
            const priceValue = draft !== undefined ? draft : (r.menu_price != null ? String(r.menu_price) : "");
            return (
              <Card key={r.id} className="shadow-warm border-border/50 overflow-hidden">
                <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground/50">
                      <ImageOff className="w-8 h-8 mb-1" />
                      <span className="text-xs">No photo</span>
                    </div>
                  )}
                </div>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg font-semibold leading-tight">{r.name}</h3>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="font-display text-lg font-bold text-gradient-gold">${effective.toFixed(2)}</span>
                        <span className="text-[10px] text-muted-foreground">/person</span>
                      </div>
                    </div>
                    {r.category && <p className="text-xs text-muted-foreground mt-0.5">{r.category}</p>}
                    {r.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{r.description}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor={`price-${r.id}`} className="text-xs">
                      Menu price (per person)
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          id={`price-${r.id}`}
                          inputMode="decimal"
                          placeholder={`Auto: ${auto.toFixed(2)}`}
                          value={priceValue}
                          onChange={(e) => setPriceDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                          onBlur={() => draft !== undefined && commitPrice(r.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          className="pl-7"
                        />
                      </div>
                      {draft !== undefined && (
                        <span className="text-[10px] text-muted-foreground">unsaved</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Leave blank to use auto price (cost × {MARKUP}).
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
                    <ToggleRow
                      label="Show on menu"
                      checked={r.active}
                      onChange={(v) => updateRecipe(r.id, { active: v })}
                      disabled={savingId === r.id}
                    />
                    <ToggleRow
                      label="Standard"
                      checked={r.is_standard}
                      onChange={(v) => updateRecipe(r.id, { is_standard: v })}
                      disabled={savingId === r.id}
                    />
                    <ToggleRow
                      label="Premium"
                      checked={r.is_premium}
                      onChange={(v) => updateRecipe(r.id, { is_premium: v })}
                      disabled={savingId === r.id}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-1 rounded-md bg-muted/30">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
