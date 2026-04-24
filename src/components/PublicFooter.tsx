import { Link } from "@tanstack/react-router";
import { Mail, Phone, Instagram, Facebook } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/vpsfinest-logo.png";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { ServiceAreaBadges } from "@/components/ServiceAreaBadges";
import { useBrandAsset } from "@/lib/brand-assets";
import { useBrandName } from "@/lib/brand-config";

const EMAIL = "hello@vpsfinest.com";
const PHONE_DISPLAY = "(330) 555-0199";
const PHONE_HREF = "+13305550199";
const INSTAGRAM_URL = "https://instagram.com/vpsfinest";
const FACEBOOK_URL = "https://facebook.com/vpsfinest";
const LOGO_FALLBACK_URL =
  "https://qzxndabxkzhplhspkkoi.supabase.co/storage/v1/object/public/site-assets/brand/vpsfinest-logo.png";

export function PublicFooter() {
  const { data: brandLogoUrl } = useBrandAsset("primary_logo");
  const { display: brandDisplay } = useBrandName();
  const [logoSrc, setLogoSrc] = useState<string>(logo);
  const effectiveSrc = brandLogoUrl || logoSrc;
  return (
    <footer className="bg-foreground text-background py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 pb-12 border-b border-background/10 grid gap-6 md:grid-cols-[1.4fr_1fr] items-center">
          <div>
            <h3 className="font-display text-2xl font-semibold mb-2">Free Weeknight Recipe Guide</h3>
            <p className="text-sm text-background/70 leading-relaxed max-w-md">
              Five reliable recipes we cook on busy nights. Plus one calm note a month — never spammy.
            </p>
          </div>
          <NewsletterSignup variant="footer" source="footer" />
        </div>
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <img
                src={effectiveSrc}
                alt={brandDisplay}
                className="h-9 w-auto object-contain bg-background/90 rounded-md p-1"
                loading="lazy"
                onError={() => {
                  if (!brandLogoUrl && logoSrc !== LOGO_FALLBACK_URL) setLogoSrc(LOGO_FALLBACK_URL);
                }}
              />
              <span className="font-display text-lg font-semibold">{brandDisplay}</span>
            </div>
            <p className="text-sm text-background/60 leading-relaxed">
              Professional wedding and event catering from Aurora, Ohio.
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
              <li><Link to="/terms" className="text-background/70 hover:text-background transition-colors">Terms</Link></li>
              <li><Link to="/privacy" className="text-background/70 hover:text-background transition-colors">Privacy</Link></li>
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

        <div className="mt-12 pt-6 border-t border-background/10 space-y-4">
          <ServiceAreaBadges tone="light" />
          <p className="text-xs text-background/50 text-center">
            © {new Date().getFullYear()} {brandDisplay} Catering. Crafted with care for unforgettable events.
          </p>
        </div>
      </div>
    </footer>
  );
}
