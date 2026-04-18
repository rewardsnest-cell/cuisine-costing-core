import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dashboard\n\nSitemap: https://www.vpsfinest.com/sitemap.xml\n`;
        return new Response(body, { headers: { "Content-Type": "text/plain" } });
      },
    },
  },
});
