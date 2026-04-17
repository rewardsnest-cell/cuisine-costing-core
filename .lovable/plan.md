

User wants both quote builders available, clearly labeled, with a "Switch to Advanced (AI)" button on the basic builder that hands off current progress so the AI picks up where they left off.

## Plan: Dual Quote Builders with Seamless Handoff

### Entry & labeling
- `/quote` → labeled **"Basic Builder"** (the existing wizard, unchanged)
- `/quote/ai` → labeled **"Advanced AI Builder"** (new conversational flow)
- Homepage hero shows both as side-by-side CTAs: "Basic Builder" and "Advanced AI Builder"
- Each page shows a small mode badge at the top: "Basic Builder" or "Advanced AI Builder"

### The handoff (the key new behavior)

**Basic → Advanced**
- A "Switch to Advanced AI" button is visible on every step of `/quote`
- On click: stash current `selections` in `sessionStorage.quote_handoff` and navigate to `/quote/ai`
- AI route hydrates `selections` from sessionStorage, then sends a hidden first message to the AI like:
  > "The user has already filled in: style=meat, proteins=[ribeye, chicken], guestCount=50, eventDate=2026-06-15. Acknowledge what's set, then continue asking only for missing info (allergies, sides, addons, tier, vibe, alcohol, contact details)."
- AI greets with "Great — I see you've picked X, Y, Z. Let's pick up from there. Quick question…" and asks the next logical question
- Live Event Summary panel renders the pre-filled fields immediately so user sees their progress carried over

**Advanced → Basic** (escape hatch)
- A "Switch to Basic Builder" link on `/quote/ai`
- Stashes current AI-collected `selections` in sessionStorage; basic wizard hydrates and jumps to the furthest completed step

### AI assistant build (same as previously planned)
- Edge function `supabase/functions/quote-assistant/index.ts` — streams from Lovable AI Gateway (`google/gemini-3-flash-preview`), uses tool calling with one `update_quote_draft` tool that includes both base fields and the granular `preferences` object (protein cuts, alcohol, vibe, spice level)
- Route `src/routes/quote.ai.tsx` — chat UI (left) + live Event Summary (right), stacks on mobile, react-markdown for rendering, SSE line-by-line parsing
- System prompt embeds menu catalog from `src/components/quote/types.ts` and instructs sequencing: acknowledge prefilled state → ask missing basics → probe granular preferences → confirm → submit
- Final submit reuses existing DB insert path (same `selections` shape)

### Code-level changes

**Create**
- `supabase/functions/quote-assistant/index.ts` — streaming + tool calling, handles 429/402
- `src/routes/quote.ai.tsx` — chat + summary panel + handoff hydration

**Edit**
- `src/components/quote/types.ts` — extend `QuoteSelections` with optional `preferences` object
- `src/routes/quote.tsx`:
  - Add "Basic Builder" badge at top
  - Add persistent "Switch to Advanced AI →" button (top-right of progress area)
  - On mount: check `sessionStorage.quote_handoff` (when arriving from AI) and hydrate selections, jump to furthest step
- `src/routes/index.tsx` — replace single quote CTA with two buttons: Basic Builder + Advanced AI Builder
- `supabase/config.toml` — register `quote-assistant` function with `verify_jwt = false`
- Add `react-markdown` dependency

### What user gets
- Two clearly labeled paths, no forced choice
- Mid-flow switching with zero data loss in either direction
- AI is context-aware: it acknowledges prefilled fields and only asks what's missing
- Same submit/PDF/DB pipeline for both — no risk to existing functionality

