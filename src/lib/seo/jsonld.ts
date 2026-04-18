export const SITE_URL = "https://www.vpfinest.com";
export const BRAND = "VPS Finest";

export function articleJsonLd(opts: {
  title: string;
  description: string;
  url: string;
  datePublished?: string;
}) {
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: opts.title,
      description: opts.description,
      author: { "@type": "Organization", name: BRAND, url: SITE_URL },
      publisher: {
        "@type": "Organization",
        name: BRAND,
        url: SITE_URL,
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": opts.url },
      datePublished: opts.datePublished ?? "2025-01-01",
      inLanguage: "en-US",
    }),
  };
}

export function faqJsonLd(faqs: Array<{ q: string; a: string }>) {
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    }),
  };
}

export function localBusinessJsonLd(opts: {
  url: string;
  description: string;
  primaryCity: string;
}) {
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FoodEstablishment",
      "@id": `${SITE_URL}#business`,
      name: BRAND,
      url: opts.url,
      description: opts.description,
      servesCuisine: ["American", "Seasonal"],
      priceRange: "$$$",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Aurora",
        addressRegion: "OH",
        addressCountry: "US",
      },
      areaServed: [
        { "@type": "City", name: "Aurora", address: { "@type": "PostalAddress", addressRegion: "OH", addressCountry: "US" } },
        { "@type": "City", name: "Hudson", address: { "@type": "PostalAddress", addressRegion: "OH", addressCountry: "US" } },
        { "@type": "City", name: "Cleveland", address: { "@type": "PostalAddress", addressRegion: "OH", addressCountry: "US" } },
        { "@type": "AdministrativeArea", name: "Northeast Ohio" },
      ],
      makesOffer: {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: `Wedding catering in ${opts.primaryCity}`,
          areaServed: opts.primaryCity,
        },
      },
    }),
  };
}
