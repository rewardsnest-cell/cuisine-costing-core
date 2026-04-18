export function PublicFooter() {
  return (
    <footer className="bg-foreground text-background py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-accent-foreground font-bold text-xs">TQ</span>
            </div>
            <span className="font-display text-lg font-semibold">TasteQuote</span>
          </div>
          <p className="text-sm text-background/60">© {new Date().getFullYear()} TasteQuote. Premium catering solutions.</p>
        </div>
      </div>
    </footer>
  );
}
