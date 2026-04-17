import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SECTION_KEYS, type SectionKey } from "./sections";

type Map = Record<SectionKey, boolean>;

const allFalse: Map = SECTION_KEYS.reduce((acc, k) => {
  acc[k] = false;
  return acc;
}, {} as Map);

export function useSectionAccess() {
  const { user, isAdmin, isEmployee } = useAuth();
  const [map, setMap] = useState<Map>(allFalse);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMap(allFalse);
      setLoading(false);
      return;
    }
    (async () => {
      // Admin sees everything always
      if (isAdmin) {
        const all = SECTION_KEYS.reduce((acc, k) => ({ ...acc, [k]: true }), {} as Map);
        setMap(all);
        setLoading(false);
        return;
      }
      const role = isEmployee ? "employee" : "user";
      const [perms, overrides] = await Promise.all([
        (supabase as any)
          .from("role_section_permissions")
          .select("section, enabled")
          .eq("role", role),
        (supabase as any)
          .from("user_section_overrides")
          .select("section, enabled")
          .eq("user_id", user.id),
      ]);
      const next: Map = { ...allFalse };
      for (const r of perms.data ?? []) next[r.section as SectionKey] = !!r.enabled;
      for (const o of overrides.data ?? []) next[o.section as SectionKey] = !!o.enabled;
      setMap(next);
      setLoading(false);
    })();
  }, [user, isAdmin, isEmployee]);

  return { access: map, loading };
}
