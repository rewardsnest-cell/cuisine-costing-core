import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

const LAST_UPDATED = "April 23, 2026";
const CONTACT_EMAIL = "hello@vpsfinest.com";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — VPS Finest" },
      {
        name: "description",
        content:
          "The terms governing your use of VPS Finest catering services, recipes, and website.",
      },
      { property: "og:title", content: "Terms of Service — VPS Finest" },
      {
        property: "og:description",
        content:
          "The terms governing your use of VPS Finest catering services, recipes, and website.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl md:text-5xl font-semibold mb-4">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Last updated: {LAST_UPDATED}
          </p>

          <div className="prose prose-neutral max-w-none space-y-8 text-foreground">
            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using the VPS Finest website, requesting a quote, or booking
                catering services, you agree to be bound by these Terms of Service. If you do
                not agree, please do not use our services.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">2. Services</h2>
              <p className="text-muted-foreground leading-relaxed">
                VPS Finest provides catering services for private events, weddings, and
                corporate gatherings, primarily in the Aurora, Ohio area. We also publish
                recipes and educational content on our website. All quotes are estimates until
                a signed agreement and deposit are received.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">3. Bookings & Payment</h2>
              <p className="text-muted-foreground leading-relaxed">
                Event bookings are confirmed upon receipt of a signed contract and deposit.
                Final guest counts, menu selections, and balances are due according to the
                schedule outlined in your event agreement. Cancellation and refund terms are
                specified in your individual contract.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">4. Allergens & Dietary Notice</h2>
              <p className="text-muted-foreground leading-relaxed">
                We prepare food in a kitchen that handles common allergens including wheat,
                dairy, eggs, soy, nuts, and shellfish. While we take care to accommodate
                dietary restrictions, we cannot guarantee an allergen-free environment. Please
                disclose all allergies and dietary needs at booking.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">5. Website Content & Recipes</h2>
              <p className="text-muted-foreground leading-relaxed">
                Recipes, photography, and written content on this site are the intellectual
                property of VPS Finest and are provided for personal, non-commercial use.
                Republishing or selling our content without written permission is prohibited.
              </p>
            </section>

            <section className="space-y-2" id="affiliate-disclosure">
              <h2 className="font-display text-2xl font-semibold">5a. Affiliate Disclosure</h2>
              <p className="text-muted-foreground leading-relaxed">
                <strong className="text-foreground">As an Amazon Associate, VPS Finest earns
                from qualifying purchases.</strong> Some links on our website (especially in
                recipe and how-to pages) are affiliate links. If you click an affiliate link
                and make a purchase, we may earn a small commission at no additional cost to
                you. We only recommend tools and products we genuinely use or trust, and our
                editorial choices are never influenced by commission rates. Sponsored items
                are clearly labeled.
              </p>
            </section>
              <p className="text-muted-foreground leading-relaxed">
                If you create an account, you are responsible for maintaining the
                confidentiality of your credentials and for all activity under your account.
                Notify us immediately of any unauthorized use.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">7. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                To the fullest extent permitted by law, VPS Finest is not liable for indirect,
                incidental, or consequential damages arising from your use of our services or
                website. Our total liability is limited to the amount paid for the specific
                service in question.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">8. Changes to These Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update these Terms from time to time. Continued use of the website or
                services after changes are posted constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">9. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                Questions about these Terms? Email us at{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                or visit our{" "}
                <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
                  contact page
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
