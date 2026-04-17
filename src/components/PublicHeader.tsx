import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function PublicHeader() {
  const { user, signOut, loading, isAdmin, isEmployee } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-warm flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">TQ</span>
          </div>
          <span className="font-display text-xl font-semibold text-foreground">TasteQuote</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block">Home</Link>
          <Link to="/quote" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Get a Quote</Link>
          <Link to="/lookup" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block">Look Up</Link>
          {!loading && user ? (
            <>
              <Link to="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
              {isEmployee && (
                <Link to="/my-events" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">My Events</Link>
              )}
              {isAdmin && (
                <Link to="/admin" className="text-xs font-semibold text-primary hover:text-primary/80 border border-primary/40 rounded-md px-3 py-1.5">Admin</Link>
              )}
              <button onClick={() => signOut()} className="text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5">
                Sign Out
              </button>
            </>
          ) : (
            <Link to="/login" className="text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5">Sign In</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
