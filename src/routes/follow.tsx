import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const emailSchema = z.string().trim().email().max(255);

export const Route = createFileRoute("/follow")({
  head: () => ({
    meta: [
      { title: "Follow Along — VPS Finest, Aurora Ohio" },
      { name: "description", content: "Follow VPS Finest for new recipes, seasonal menus, and notes from a small catering kitchen in Aurora, Ohio." },
      { property: "og:title", content: "Follow Along — VPS Finest" },
      { property: "og:description", content: "Follow along for new recipes and notes from our kitchen in Aurora, Ohio." },
    ],
  }),
  component: FollowPage,
});

function FollowPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Heading */}
      <section className="pt-32 pb-12 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-5">Follow Along</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1]">
            Notes from
            <br />
            our kitchen.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
            A quiet, occasional newsletter — new recipes, seasonal menus, and small updates from our catering work in Aurora, Ohio.
          </p>
        </div>
      </section>

      {/* Newsletter form (visual placeholder — submission to be wired up) */}
      <section className="pb-24">
        <div className="max-w-xl mx-auto px-6">
          <form
            className="border-t border-border pt-10 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const email = String(data.get("email") || "").trim();
              if (!email) return;
              // For now, route to contact with prefilled note
              window.location.href = `/contact?subject=newsletter&email=${encodeURIComponent(email)}`;
            }}
          >
            <div>
              <label htmlFor="email" className="block text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">
                Your email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full bg-transparent border-0 border-b border-border rounded-none px-0 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              No more than once or twice a month. Unsubscribe anytime.
            </p>
            <div className="pt-2">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Subscribe
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* What you'll get */}
      <section className="py-24 bg-secondary border-t border-border">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground mb-14">
            What you'll get
          </p>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { t: "New recipes", d: "The dishes we're cooking at home and bringing to gatherings." },
              { t: "Seasonal menus", d: "What's showing up on catering menus this month and why." },
              { t: "Small updates", d: "Occasional notes from a small kitchen in Aurora, Ohio." },
            ].map((v) => (
              <div key={v.t} className="text-center">
                <h2 className="font-display text-xl font-bold text-foreground mb-3">{v.t}</h2>
                <p className="text-muted-foreground leading-relaxed">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-background">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-8">
            Planning an event in the meantime?
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/catering/quote" className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-3 text-sm font-semibold tracking-wide text-primary-foreground hover:opacity-90 transition-opacity">
              Request catering information
            </Link>
            <Link to="/recipes" className="inline-flex items-center justify-center rounded-sm border border-foreground/30 px-8 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-foreground hover:text-background transition-colors">
              Browse recipes
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
