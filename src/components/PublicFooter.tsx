import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function PublicFooter() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("site_asset_manifest")
        .select("public_url, alt")
        .or("category.eq.logo,slug.ilike.%logo%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data?.public_url) setLogoUrl(data.public_url);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <footer className="bg-foreground text-background py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="VPS Finest"
                className="h-8 w-auto object-contain"
                loading="lazy"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <span className="text-accent-foreground font-bold text-xs">VF</span>
              </div>
            )}
            <span className="font-display text-lg font-semibold">VPS Finest</span>
          </div>
          <p className="text-sm text-background/60">
            © {new Date().getFullYear()} VPS Finest Catering. Crafted with care for unforgettable events.
          </p>
        </div>
      </div>
    </footer>
  );
}
