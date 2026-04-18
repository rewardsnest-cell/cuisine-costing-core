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

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/quote", label: "Catering" },
  { to: "/quote/ai", label: "Weddings" },
  { to: "/lookup", label: "Look Up" },
] as const;

export function PublicHeader() {
  const { user, signOut, loading, isAdmin, isEmployee } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm border-b border-foreground/5">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-5 flex items-center justify-between gap-6">
        {/* Wordmark */}
        <Link to="/" className="flex flex-col leading-none">
          <span className="font-display text-2xl tracking-wide uppercase text-foreground">VPS Finest</span>
          <span className="text-[10px] tracking-[0.3em] font-medium text-muted-foreground mt-1">AURORA, OHIO</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-10 text-[11px] uppercase tracking-[0.18em] font-medium text-foreground/70">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeProps={{ className: "text-foreground" }}
              className="hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Account / mobile menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-medium text-foreground/70 hover:text-foreground transition-colors focus:outline-none">
            <Menu className="w-4 h-4" />
            <span className="hidden sm:inline">Menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Navigate</DropdownMenuLabel>
            {NAV_LINKS.map((l) => (
              <DropdownMenuItem key={l.to} asChild>
                <Link to={l.to}>{l.label}</Link>
              </DropdownMenuItem>
            ))}

            {!loading && user && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Account</DropdownMenuLabel>
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
                <DropdownMenuItem onSelect={() => signOut()}>Sign Out</DropdownMenuItem>
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
    </header>
  );
}
