import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/vpsfinest-logo.png";
import { useBrandAsset } from "@/lib/brand-assets";
import { useBrandName } from "@/lib/brand-config";
import { useFeatureVisibilityMap, isNavLinkVisible } from "@/lib/feature-visibility";

// CDN-hosted fallback so the logo still renders if the bundled asset 404s
// in production (e.g. cache mismatch right after a deploy).
const LOGO_FALLBACK_URL =
  "https://qzxndabxkzhplhspkkoi.supabase.co/storage/v1/object/public/site-assets/brand/vpsfinest-logo.png";

export function PublicHeader() {
  const { user, signOut, loading, isAdmin, isEmployee } = useAuth();
  const { data: brandLogoUrl } = useBrandAsset("primary_logo");
  const { display: brandDisplay } = useBrandName();
  const { map: visibilityMap } = useFeatureVisibilityMap();
  const showLink = (key: string) => isNavLinkVisible(visibilityMap, key);
  const [logoSrc, setLogoSrc] = useState<string>(logo);
  const effectiveSrc = brandLogoUrl || logoSrc;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img
            src={effectiveSrc}
            alt={brandDisplay}
            className="h-9 w-auto object-contain"
            loading="eager"
            onError={() => {
              if (!brandLogoUrl && logoSrc !== LOGO_FALLBACK_URL) setLogoSrc(LOGO_FALLBACK_URL);
            }}
          />
          <span className="font-display text-xl font-semibold text-foreground">{brandDisplay}</span>
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm">
          {showLink("catering") && <Link to="/catering" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Catering</Link>}
          {showLink("menu") && <Link to="/menu" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Menu</Link>}
          {showLink("weddings") && <Link to="/weddings" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Weddings</Link>}
          {showLink("recipes") && <Link to="/recipes" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Recipes</Link>}
          {(showLink("inspired") || isAdmin) && (
            <Link to="/inspired" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Inspired</Link>
          )}
          {showLink("guides") && <Link to="/guides" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Guides</Link>}
          {showLink("blog") && <Link to="/blog" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Blog</Link>}
          <Link to="/about" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>About</Link>
          <Link to="/contact" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Contact</Link>
        </div>

        <div className="flex items-center gap-3">
          {showLink("quote") && (
            <Link to="/catering/quote" className="hidden sm:inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
              Get a Quote
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Open navigation menu"
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground border border-border rounded-md px-3 py-1.5 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
              <span>Menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Navigate</DropdownMenuLabel>
              <DropdownMenuItem asChild><Link to="/">Home</Link></DropdownMenuItem>
              {showLink("catering") && <DropdownMenuItem asChild><Link to="/catering">Catering</Link></DropdownMenuItem>}
              {showLink("menu") && <DropdownMenuItem asChild><Link to="/menu">Menu</Link></DropdownMenuItem>}
              {showLink("weddings") && <DropdownMenuItem asChild><Link to="/weddings">Weddings</Link></DropdownMenuItem>}
              {showLink("recipes") && <DropdownMenuItem asChild><Link to="/recipes">Recipes</Link></DropdownMenuItem>}
              {(showLink("inspired") || isAdmin) && (
                <DropdownMenuItem asChild><Link to="/inspired">Inspired</Link></DropdownMenuItem>
              )}
              {showLink("guides") && <DropdownMenuItem asChild><Link to="/guides">Guides</Link></DropdownMenuItem>}
              {showLink("blog") && <DropdownMenuItem asChild><Link to="/blog">Blog</Link></DropdownMenuItem>}
              <DropdownMenuItem asChild><Link to="/about">About</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/contact">Contact</Link></DropdownMenuItem>
              {showLink("quote") && <DropdownMenuItem asChild><Link to="/catering/quote">Get a Quote</Link></DropdownMenuItem>}
              {showLink("lookup") && <DropdownMenuItem asChild><Link to="/lookup">Look Up Quote</Link></DropdownMenuItem>}

              {!loading && user && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>User</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard">Dashboard</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/my-quotes">My Quotes</Link>
                  </DropdownMenuItem>

                  {(isEmployee || isAdmin) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Employee</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link to="/employee">Employee Dashboard</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/my-events">My Events</Link>
                      </DropdownMenuItem>
                    </>
                  )}

                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Admin</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link to="/admin">Admin Panel</Link>
                      </DropdownMenuItem>
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => signOut()}>
                    Sign Out
                  </DropdownMenuItem>
                </>
              )}

              {!loading && !user && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/login">Sign In</Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
