import { Link, useLocation } from "@tanstack/react-router";
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

export function PublicHeader() {
  const { user, signOut, loading, isAdmin, isEmployee } = useAuth();
  const location = useLocation();
  const inAdmin = location.pathname.startsWith("/admin");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-warm flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">TQ</span>
          </div>
          <span className="font-display text-xl font-semibold text-foreground">TasteQuote</span>
        </Link>

        <div className="flex items-center gap-3">
          {!loading && user && isAdmin && (
            <div className="hidden sm:inline-flex items-center rounded-md border border-border p-0.5 bg-muted/40">
              <Link
                to="/dashboard"
                className={`text-xs font-medium px-2.5 py-1 rounded ${!inAdmin ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                User
              </Link>
              <Link
                to="/admin"
                className={`text-xs font-semibold px-2.5 py-1 rounded ${inAdmin ? "bg-primary text-primary-foreground shadow-sm" : "text-primary hover:text-primary/80"}`}
              >
                Admin
              </Link>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 text-sm font-medium text-foreground border border-border rounded-md px-3 py-1.5 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring">
              <Menu className="w-4 h-4" />
              <span>Menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Navigate</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/">Home</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/quote">Get a Quote</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/lookup">Look Up</Link>
              </DropdownMenuItem>

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
