import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, Phone, Instagram, Facebook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const EMAIL = "hello@vpsfinest.com";
const PHONE_DISPLAY = "(330) 555-0199";
const PHONE_HREF = "+13305550199";
const INSTAGRAM_URL = "https://instagram.com/vpsfinest";
const FACEBOOK_URL = "https://facebook.com/vpsfinest";

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
    <footer className="bg-foreground text-background py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <img src={logoUrl} alt="VPS Finest" className="h-8 w-auto object-contain" loading="lazy" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                  <span className="text-accent-foreground font-bold text-xs">VF</span>
                </div>
              )}
              <span className="font-display text-lg font-semibold">VPS Finest</span>
            </div>
            <p className="text-sm text-background/60 leading-relaxed">
              Thoughtful catering and calm recipes from Aurora, Ohio.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-xs tracking-[0.2em] uppercase text-background/80 mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/catering" className="text-background/70 hover:text-background transition-colors">Catering</Link></li>
              <li><Link to="/weddings" className="text-background/70 hover:text-background transition-colors">Weddings</Link></li>
              <li><Link to="/recipes" className="text-background/70 hover:text-background transition-colors">Recipes</Link></li>
              <li><Link to="/blog" className="text-background/70 hover:text-background transition-colors">Guides</Link></li>
              <li><Link to="/contact" className="text-background/70 hover:text-background transition-colors">Contact</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs tracking-[0.2em] uppercase text-background/80 mb-4">Contact</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href={`mailto:${EMAIL}`} className="inline-flex items-center gap-2 text-background/70 hover:text-background transition-colors">
                  <Mail className="w-4 h-4" />
                  {EMAIL}
                </a>
              </li>
              <li>
                <a href={`tel:${PHONE_HREF}`} className="inline-flex items-center gap-2 text-background/70 hover:text-background transition-colors">
                  <Phone className="w-4 h-4" />
                  {PHONE_DISPLAY}
                </a>
              </li>
              <li className="text-background/60">Aurora, Ohio</li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h3 className="text-xs tracking-[0.2em] uppercase text-background/80 mb-4">Follow</h3>
            <div className="flex gap-3">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="VPS Finest on Instagram"
                className="w-10 h-10 rounded-full border border-background/20 flex items-center justify-center text-background/70 hover:text-background hover:border-background/60 transition-colors"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="VPS Finest on Facebook"
                className="w-10 h-10 rounded-full border border-background/20 flex items-center justify-center text-background/70 hover:text-background hover:border-background/60 transition-colors"
              >
                <Facebook className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-background/10 text-xs text-background/50 text-center">
          © {new Date().getFullYear()} VPS Finest Catering. Crafted with care for unforgettable events.
        </div>
      </div>
    </footer>
  );
}
