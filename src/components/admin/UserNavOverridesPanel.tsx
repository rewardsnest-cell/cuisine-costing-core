import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NAV_GROUPS } from "@/routes/admin";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Override = { nav_key: string; allowed: boolean };

export function UserNavOverridesPanel({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("user_nav_overrides")
        .select("nav_key, allowed")
        .eq("user_id", userId);
      if (cancelled) return;
      const map: Record<string, boolean> = {};
      for (const row of (data ?? []) as Override[]) map[row.nav_key] = !!row.allowed;
      setOverrides(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // visible = no row, or allowed=true
  const isOn = (key: string) => (key in overrides ? overrides[key] : true);

  const setKey = async (navKey: string, allowed: boolean) => {
    setSaving(navKey);
    try {
      // Upsert on (user_id, nav_key) — unique constraint handles dedup.
      const { error } = await (supabase as any)
        .from("user_nav_overrides")
        .upsert(
          { user_id: userId, nav_key: navKey, allowed },
          { onConflict: "user_id,nav_key" },
        );
      if (error) throw error;
      setOverrides((p) => ({ ...p, [navKey]: allowed }));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save nav override");
    } finally {
      setSaving(null);
    }
  };

  const resetAll = async () => {
    if (!confirm("Reset this user's navigation to defaults (everything visible)?")) return;
    setSaving("__reset__");
    try {
      const { error } = await (supabase as any)
        .from("user_nav_overrides")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
      setOverrides({});
      toast.success("Navigation reset to defaults.");
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    } finally {
      setSaving(null);
    }
  };

  const stats = useMemo(() => {
    let totalItems = 0;
    let hidden = 0;
    for (const g of NAV_GROUPS) {
      if (!isOn(`group:${g.label}`)) {
        // whole group hidden — count every item as hidden
        hidden += g.items.length;
        totalItems += g.items.length;
        continue;
      }
      for (const it of g.items) {
        totalItems += 1;
        if (!isOn(it.to)) hidden += 1;
      }
    }
    return { totalItems, hidden, visible: totalItems - hidden };
  }, [overrides]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading navigation…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {stats.visible}/{stats.totalItems} pages visible · {stats.hidden} hidden.
          Toggle a whole group, or individual pages within it.
        </p>
        <button
          type="button"
          onClick={resetAll}
          disabled={saving === "__reset__"}
          className="text-xs text-primary hover:underline disabled:opacity-50"
        >
          Reset to defaults
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {NAV_GROUPS.map((g) => {
          const groupKey = `group:${g.label}`;
          const groupOn = isOn(groupKey);
          return (
            <div key={g.label} className="border rounded-md p-3 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{g.label}</p>
                  <p className="text-[11px] text-muted-foreground">{g.items.length} pages</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {saving === groupKey && <Loader2 className="w-3 h-3 animate-spin" />}
                  <Switch
                    checked={groupOn}
                    onCheckedChange={(v) => setKey(groupKey, v)}
                    aria-label={`Toggle ${g.label} group`}
                  />
                </div>
              </div>
              <div
                className={`mt-2 space-y-1.5 ${groupOn ? "" : "opacity-40 pointer-events-none"}`}
              >
                {g.items.map((it) => {
                  const itemOn = isOn(it.to);
                  return (
                    <div
                      key={it.to}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate">{it.label}</p>
                        <p className="font-mono text-[10px] text-muted-foreground truncate">
                          {it.to}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {saving === it.to && <Loader2 className="w-3 h-3 animate-spin" />}
                        <Switch
                          checked={itemOn}
                          onCheckedChange={(v) => setKey(it.to, v)}
                          aria-label={`Toggle ${it.label}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
