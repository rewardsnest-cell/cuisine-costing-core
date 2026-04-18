import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Plus, Minus, X, ArrowRight, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

const STORAGE_KEY = "menu_selections_v1";

export type MenuSelection = {
  id: string;
  name: string;
  category: string | null;
  cost_per_serving: number;
  qty: number;
};

function load(): MenuSelection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s) => s && s.id && s.name);
    return [];
  } catch {
    return [];
  }
}

function save(items: MenuSelection[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

// Hook that exposes selections + mutators, kept in sync via a CustomEvent so
// add buttons on cards stay in lock-step with the tray.
const EVENT = "menu-selections-changed";

export function useMenuSelections() {
  const [items, setItems] = useState<MenuSelection[]>(() => load());

  useEffect(() => {
    const handler = () => setItems(load());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const broadcast = (next: MenuSelection[]) => {
    save(next);
    setItems(next);
    window.dispatchEvent(new Event(EVENT));
  };

  const add = (item: Omit<MenuSelection, "qty">) => {
    const cur = load();
    const idx = cur.findIndex((s) => s.id === item.id);
    if (idx >= 0) {
      cur[idx] = { ...cur[idx], qty: cur[idx].qty + 1 };
    } else {
      cur.push({ ...item, qty: 1 });
    }
    broadcast(cur);
  };

  const setQty = (id: string, qty: number) => {
    const cur = load();
    if (qty <= 0) {
      broadcast(cur.filter((s) => s.id !== id));
      return;
    }
    broadcast(cur.map((s) => (s.id === id ? { ...s, qty } : s)));
  };

  const remove = (id: string) => {
    broadcast(load().filter((s) => s.id !== id));
  };

  const clear = () => broadcast([]);

  const has = (id: string) => items.some((s) => s.id === id);
  const qtyOf = (id: string) => items.find((s) => s.id === id)?.qty ?? 0;

  return { items, add, setQty, remove, clear, has, qtyOf };
}

export function SelectionTray({ markup = 3.5 }: { markup?: number }) {
  const { items, setQty, remove, clear } = useMenuSelections();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const totalDishes = items.reduce((n, i) => n + i.qty, 0);
  const perGuest = items.reduce((sum, i) => sum + i.cost_per_serving * markup * i.qty, 0);

  if (items.length === 0) return null;

  const handleSendToQuote = () => {
    try {
      sessionStorage.setItem(
        "quote_handoff",
        JSON.stringify({
          recipes: items.map((i) => ({
            id: i.id,
            name: i.name,
            category: i.category,
            cost_per_serving: i.cost_per_serving,
            servings_per_guest: i.qty,
          })),
        })
      );
      sessionStorage.setItem("quote_handoff_jump_review", "1");
    } catch {
      toast.error("Couldn't save your selections. Please try again.");
      return;
    }
    toast.success(`Sending ${totalDishes} dish${totalDishes === 1 ? "" : "es"} to your quote…`);
    navigate({ to: "/catering/quote" });
  };

  return (
    <>
      {/* Floating button (collapsed) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-warm text-primary-foreground shadow-warm hover:scale-105 transition-transform"
          aria-label="Open my selections"
        >
          <ShoppingBag className="w-4 h-4" />
          <span className="font-medium">My Selections</span>
          <span className="ml-1 inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-background/30 text-xs font-bold">
            {totalDishes}
          </span>
        </button>
      )}

      {/* Expanded tray */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96">
          <div className="bg-card border border-border shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-primary" />
                <h3 className="font-display font-semibold">My Selections</h3>
                <span className="text-xs text-muted-foreground">
                  ({totalDishes} dish{totalDishes === 1 ? "" : "es"})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clear}
                  className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors"
                  title="Clear all selections"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-md"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border/60">
              {items.map((item) => {
                const linePrice = item.cost_per_serving * markup * item.qty;
                return (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-tight truncate">{item.name}</p>
                      {item.category && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{item.category}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        ${(item.cost_per_serving * markup).toFixed(2)} × {item.qty} ={" "}
                        <span className="font-semibold text-foreground">${linePrice.toFixed(2)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setQty(item.id, item.qty - 1)}
                        className="w-7 h-7 rounded-md border border-border hover:bg-muted inline-flex items-center justify-center"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="min-w-6 text-center text-sm font-semibold">{item.qty}</span>
                      <button
                        onClick={() => setQty(item.id, item.qty + 1)}
                        className="w-7 h-7 rounded-md border border-border hover:bg-muted inline-flex items-center justify-center"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => remove(item.id)}
                        className="w-7 h-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center justify-center ml-1"
                        aria-label="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border p-4 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated per guest</span>
                <span className="font-display text-lg font-bold text-gradient-gold">
                  ${perGuest.toFixed(2)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Final price depends on guest count, service style, and event details.
              </p>
              <Button
                onClick={handleSendToQuote}
                className="w-full bg-gradient-warm text-primary-foreground gap-2"
              >
                Continue to Quote <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
