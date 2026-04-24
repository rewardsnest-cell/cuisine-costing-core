import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { BrandConfigProvider } from "@/lib/brand-config";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { MobileQuoteBar } from "@/components/MobileQuoteBar";
import { FeedbackButton } from "@/components/FeedbackButton";
import { SkipToContent } from "@/components/SkipToContent";
import "@/styles.css";

// Routes that manage their own chrome — no global PublicHeader/Footer
const NO_PUBLIC_CHROME_PREFIXES = [
  "/admin",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/set-password",
  "/lovable",
  "/api",
];

function shouldShowPublicChrome(pathname: string): boolean {
  return !NO_PUBLIC_CHROME_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-semibold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <a href="/" className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VPS Finest — Catering & Recipes in Aurora, Ohio" },
      { name: "description", content: "Thoughtful catering for weddings and gatherings, plus calm, reliable recipes for everyday cooking. Aurora, Ohio." },
      { property: "og:title", content: "VPS Finest — Catering & Recipes in Aurora, Ohio" },
      { name: "twitter:title", content: "VPS Finest — Catering & Recipes in Aurora, Ohio" },
      { property: "og:description", content: "Thoughtful catering for weddings and gatherings, plus calm, reliable recipes for everyday cooking." },
      { name: "twitter:description", content: "Thoughtful catering for weddings and gatherings, plus calm, reliable recipes for everyday cooking." },
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Source+Sans+3:wght@300;400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showChrome = shouldShowPublicChrome(pathname);
  return (
    <QueryClientProvider client={queryClient}>
      <BrandConfigProvider>
      <AuthProvider>
        <ConfirmProvider>
          <SkipToContent />
          {showChrome ? (
            <div className="min-h-screen bg-background flex flex-col">
              <PublicHeader />
              <main id="main-content" className="flex-1 pb-16 md:pb-0" tabIndex={-1}>
                <Outlet />
              </main>
              <PublicFooter />
              <MobileQuoteBar />
            </div>
          ) : (
            <main id="main-content" tabIndex={-1}>
              <Outlet />
            </main>
          )}
          <FeedbackButton />
        </ConfirmProvider>
      </AuthProvider>
      </BrandConfigProvider>
    </QueryClientProvider>
  );
}
