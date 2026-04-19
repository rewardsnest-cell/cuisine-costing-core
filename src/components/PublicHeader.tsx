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
import logo from "@/assets/vpsfinest-logo.png";

export function PublicHeader() {
  const { user, signOut, loading, isAdmin, isEmployee } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="VPS Finest" className="h-9 w-auto object-contain" loading="eager" />
          <span className="font-display text-xl font-semibold text-foreground">VPS Finest</span>
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm">
          <Link to="/catering" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Catering</Link>
          <Link to="/menu" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Menu</Link>
          <Link to="/weddings" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Weddings</Link>
          <Link to="/recipes" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Recipes</Link>
          <Link to="/blog" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Guides</Link>
          <Link to="/about" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>About</Link>
          <Link to="/contact" className="text-foreground hover:text-primary transition-colors" activeProps={{ className: "font-semibold text-primary" }}>Contact</Link>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/catering/quote" className="hidden sm:inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
            Get a Quote
          </Link>
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
              <DropdownMenuItem asChild><Link to="/catering">Catering</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/menu">Menu</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/weddings">Weddings</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/recipes">Recipes</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/blog">Guides</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/about">About</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/contact">Contact</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/catering/quote">Get a Quote</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/lookup">Look Up Quote</Link></DropdownMenuItem>

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
