import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Per-user navigation visibility overrides.
 *
 * Returns a map of `nav_key -> allowed`. A `nav_key` can be either:
 *   - a route path like `/admin/quotes` (hides a single sidebar item), or
 *   - `group:<Group Label>` (hides a whole sidebar group).
 *
 * Anything missing from the map = visible by default. Use `isAllowed(key)`
 * to check the rules without worrying about that.
 */
export function useNavOverrides() {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setOverrides({});
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("user_nav_overrides")
        .select("nav_key, allowed")
        .eq("user_id", user.id);
      if (cancelled) return;
      const map: Record<string, boolean> = {};
      for (const row of data ?? []) map[row.nav_key as string] = !!row.allowed;
      setOverrides(map);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isAllowed = (key: string): boolean => {
    if (!(key in overrides)) return true; // default visible
    return overrides[key];
  };

  return { overrides, isAllowed, loaded };
}
