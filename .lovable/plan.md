# Phase One — Brand Foundation & Homepage First Impression

Scope: branding, theme, colors, tone, and the public homepage. Applies site-wide to public pages (home, weddings, catering, menu, recipes index, guides, blog) — but only at the layer of color tokens, typography, spacing, and shared components. **No** changes to quoting logic, pricing, admin, or recipe content.

---

## 1. Color system (site-wide)

Update the design tokens in `src/styles.css` so the entire app inherits the new palette automatically.

- **Background**: keep warm off-white (current cream is on-brand; soften slightly toward neutral)
- **Foreground**: deep warm charcoal (avoid near-black)
- **Primary (anchor green)**: a deep, restrained forest/sage green used for buttons, key links, and emphasis — never as a dominant background
- **Secondary**: soft warm gray for section bands (replaces the current cream-on-cream banding)
- **Accent**: a muted warm brass/clay for small highlights only (rules, dividers, micro-icons)
- **Muted / borders**: low-contrast warm grays
- Remove the gold gradient utilities from being used in public surfaces (kept in CSS, but not referenced on public pages)

Result: the green reads as a confident anchor on a calm warm-neutral canvas. No high-contrast or stark combinations.

## 2. Typography & rhythm

- Keep `Libre Baskerville` (display) + `Source Sans 3` (body) — they already read professional
- Tighten heading weights and slightly reduce hero size on desktop so it feels structured rather than dramatic
- Increase vertical section padding (py-20 → py-24) on the homepage and standardize on `max-w-5xl` content containers for a calmer, more business-grade rhythm
- Remove decorative tracking on small caps where it currently feels fashion-y; keep one consistent eyebrow style

## 3. Homepage restructure (`src/routes/index.tsx`)

New section order, identical on desktop and mobile but with mobile-only de-emphasis of the secondary blocks:

1. **Hero** — calm, single promise, two CTAs
   - Eyebrow: `Aurora, Ohio · Wedding & Event Catering`
   - H1: `Catering for weddings and curated events.`
   - Sub: `Organized planning, itemized quotes, and quiet execution — from a team that does this every weekend.`
   - Primary CTA: **Explore Weddings** → `/weddings`
   - Secondary CTA: **Start a Quote** → `/catering/quote`
   - Remove the "done quietly" tagline and the guarantee badge from the hero (badge moves down)

2. **Two Doors** — Weddings (visually dominant) + Events
   - Add `emphasis="weddings"` prop to `TwoDoors` so the wedding card spans wider on desktop (`md:col-span-2` style treatment) and renders first on mobile
   - Rewrite copy to remove "calm/quiet" repetition; lead with structure

3. **Three promises** (`PromisesStrip`) — keep, retitle to feel operational:
   - "Itemized quotes" / "Tastings before you book" / "Aurora-based, NE Ohio served"

4. **How it works** — keep the 3-step pattern, neutral copy

5. **Social proof** — testimonials + the 100+ stat

6. **Secondary awareness strip** (NEW, low-key) — a single horizontal band with three small links: `Browse menus →` `Recipes →` `Follow along →`. No imagery, no headlines. This is the only place recipes/social are surfaced on the homepage.

7. **Final CTA** — Wedding inquiry / Event quote / Contact

**Removed from homepage:**
- The "Weeknight Recipe Guide" lead-magnet section
- The "Cooking Lab" teaser section
- The PhotoGrid (moves off the homepage; can live on `/about` or `/weddings` later — out of Phase One scope to relocate)
- `FloatingQuoteCTA` — replaced by a quieter sticky bar only on mobile (see §4)

## 4. Device awareness

- **Desktop (md+)**: Two Doors renders weddings 2/3 width, events 1/3 width. Secondary awareness strip is small text-only.
- **Mobile**: Wedding door first, full width; event door second; secondary strip collapses into a single line of text links. The floating round Quote button is replaced by a thin, non-intrusive bottom bar with two text links: `Weddings` · `Get a quote` (only on `/`, `/weddings`, `/catering`).

## 5. Tone & copy pass (homepage + shared components)

Rewrite the visible copy on:
- `src/routes/index.tsx` (hero, section eyebrows, final CTA)
- `src/components/TwoDoors.tsx` (headlines + sub-copy on both cards)
- `src/components/PromisesStrip.tsx` (titles + bodies)
- `src/components/GuaranteeBadge.tsx` (shorten to `Itemized quotes, in writing.`)
- `src/components/FloatingQuoteCTA.tsx` (replace with mobile-only `MobileCTABar` — quieter)

Voice rules applied: remove "calm/quiet/dream/curated" repetition, drop sparkles iconography, no emotional selling. Keep sentences short and operational.

## 6. Familiar Favorites boundary

- Header nav: keep the `Familiar Favorites` link visible only when the existing feature flag turns it on (no change to logic), but **remove** any homepage references to it
- No copy on the homepage will name, describe, or hint at copycat recipes
- The `/familiar-favorites` route itself is untouched in Phase One

## 7. Site-wide consistency (light touch, no page rewrites)

Because color/type tokens are global, every public page picks up the new palette automatically. Two small shared-component tweaks to keep tone consistent:
- `PublicHeader`: tighten the green hover state to use the new primary; ensure the "Get a Quote" button is the only filled-green element in the header
- `PublicFooter` (read-only check, edit only if needed): neutralize any decorative accents that clash with the new palette

No edits to weddings, catering, menu, recipes, guides, or blog page bodies in Phase One — they will inherit the new tokens.

---

## Technical change list

Files modified:
- `src/styles.css` — update `:root` color tokens (primary → green, secondary → warm gray, soften background, muted accent)
- `src/routes/index.tsx` — restructure sections, rewrite copy, remove recipe/cooking-lab/photogrid blocks, swap floating CTA for mobile bar
- `src/components/TwoDoors.tsx` — add `emphasis?: "weddings" | "balanced"` prop, asymmetric grid on desktop, reorder on mobile, copy rewrite
- `src/components/PromisesStrip.tsx` — copy rewrite
- `src/components/GuaranteeBadge.tsx` — copy shorten
- `src/components/FloatingQuoteCTA.tsx` — replace with a mobile-only thin bottom bar (`MobileCTABar`), or gate visibility to `md:hidden`
- `src/components/PublicHeader.tsx` — minor: ensure CTA button uses new primary; no structural change

Files NOT touched:
- Any `quote/*`, `admin/*`, recipe content, pricing, server functions, or DB migrations

---

## Out of scope (deferred)

- Familiar Favorites strategy, copycat seeding, recipe editorial guardrails
- Cooking Lab promotion
- Per-page (weddings/catering/menu) layout rewrites beyond inherited tokens
- Photography refresh
- Quote flow, pricing visibility, or admin work

Approve to proceed, or tell me to adjust the green hue (forest vs sage vs olive) before I start.
