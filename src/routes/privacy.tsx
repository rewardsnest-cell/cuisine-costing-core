import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";

const LAST_UPDATED = "April 23, 2026";
const CONTACT_EMAIL = "hello@vpsfinest.com";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — VPS Finest" },
      {
        name: "description",
        content:
          "How VPS Finest collects, uses, and protects your personal information when you use our website and catering services.",
      },
      { property: "og:title", content: "Privacy Policy — VPS Finest" },
      {
        property: "og:description",
        content:
          "How VPS Finest collects, uses, and protects your personal information when you use our website and catering services.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl md:text-5xl font-semibold mb-4">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Last updated: {LAST_UPDATED}
          </p>

          <div className="prose prose-neutral max-w-none space-y-8 text-foreground">
            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">1. Introduction</h2>
              <p className="text-muted-foreground leading-relaxed">
                VPS Finest ("we", "us", "our") respects your privacy. This Privacy Policy
                explains what information we collect, how we use it, and the choices you have
                regarding your data when you use our website and services.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">2. Information We Collect</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground leading-relaxed">
                <li>
                  <strong className="text-foreground">Contact details</strong> you provide
                  when requesting a quote, booking an event, or signing up for our newsletter
                  (name, email, phone, event details).
                </li>
                <li>
                  <strong className="text-foreground">Account information</strong> if you
                  create an account, including authentication identifiers managed by our
                  authentication provider.
                </li>
                <li>
                  <strong className="text-foreground">Usage data</strong> such as pages
                  visited, device type, and approximate location, collected via standard web
                  analytics.
                </li>
                <li>
                  <strong className="text-foreground">Cookies</strong> used to keep you signed
                  in and remember preferences.
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">3. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground leading-relaxed">
                <li>To respond to quote requests and deliver catering services.</li>
                <li>To send transactional messages about your booking or account.</li>
                <li>
                  To send recipe content and newsletters when you have opted in (you can
                  unsubscribe at any time).
                </li>
                <li>To improve our website, menu offerings, and customer experience.</li>
                <li>To comply with legal obligations.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">4. Sharing Your Information</h2>
              <p className="text-muted-foreground leading-relaxed">
                We do not sell your personal information. We share data only with trusted
                service providers who help us operate the business — including hosting,
                authentication, email delivery, and payment processing — and only as needed to
                provide our services. We may also disclose information when required by law.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">5. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                We retain your information for as long as your account is active or as needed
                to fulfill the purposes described in this policy, unless a longer retention
                period is required by law (e.g., tax or accounting records).
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">6. Your Choices</h2>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground leading-relaxed">
                <li>You can request access, correction, or deletion of your personal data.</li>
                <li>You can unsubscribe from marketing emails using the link in any message.</li>
                <li>You can disable cookies in your browser, though some features may not work as expected.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">7. Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use reasonable technical and organizational safeguards to protect your
                information. No method of transmission or storage is 100% secure, but we work
                to protect your data and notify you of material breaches when required.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">8. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Our services are not directed to children under 13, and we do not knowingly
                collect personal information from them.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">9. Changes to This Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. The "Last updated" date
                at the top reflects the most recent revision.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-2xl font-semibold">10. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                Questions or requests about your data? Email us at{" "}
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
