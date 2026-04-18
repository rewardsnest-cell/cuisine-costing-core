export function PublicFooter() {
  return (
    <footer className="bg-foreground text-background/60 py-20 px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
        <div className="max-w-sm">
          <h5 className="text-background font-display text-2xl mb-4 tracking-wide uppercase">VPS Finest</h5>
          <p className="text-sm leading-relaxed mb-8">
            Available for weddings, gatherings, and private events across Aurora, Ohio and beyond. Crafting memories one plate at a time.
          </p>
          <p className="text-[10px] tracking-[0.2em] uppercase text-background/30">
            © {new Date().getFullYear()} · Aurora, Ohio
          </p>
        </div>

        <div className="grid grid-cols-2 gap-16">
          <div className="space-y-4">
            <p className="text-background text-xs uppercase tracking-widest">Explore</p>
            <ul className="text-sm space-y-2">
              <li><a href="/quote" className="hover:text-background transition-colors">Catering</a></li>
              <li><a href="/quote/ai" className="hover:text-background transition-colors">Weddings</a></li>
              <li><a href="/lookup" className="hover:text-background transition-colors">Look Up Quote</a></li>
            </ul>
          </div>
          <div className="space-y-4">
            <p className="text-background text-xs uppercase tracking-widest">Inquiries</p>
            <p className="text-sm italic font-display">hello@vpsfinest.com</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
