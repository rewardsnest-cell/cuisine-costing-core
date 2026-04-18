import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, ArrowLeftRight, Loader2, X, RotateCcw, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { INITIAL_SELECTIONS, type QuoteSelections, type QuotePreferences } from "@/components/quote/types";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/quote_/ai")({
  head: () => ({
    meta: [
      { title: "Advanced AI Quote Builder — TasteQuote" },
      { name: "description", content: "Chat with our AI to build your custom catering quote — natural conversation, granular preferences, alcohol pairings, and more." },
    ],
  }),
  component: AIQuotePage,
});

type ChatMsg = { role: "user" | "assistant"; content: string };

type ChipGroup =
  | { kind: "text"; match?: RegExp; chips: string[] }
  | { kind: "date"; match: RegExp }
  | { kind: "guests"; match: RegExp };

// Try to derive chips directly from the question text when no rule matches.
// Handles two patterns:
//   1) Either/or: "...A, B, or C?" / "A or B?"
//   2) Inline list of options in quotes: '"ribeye" or "filet"'
function autoChipsFromQuestion(q: string): string[] | null {
  const cleaned = q.replace(/\s+/g, " ").trim();

  // Pattern: extract chunks between the last verb-ish phrase and the "?"
  // Look for "A, B, or C" or "A or B" near the end of the question.
  const tail = cleaned.slice(Math.max(0, cleaned.length - 220));
  const orMatch = tail.match(/([A-Za-z][\w '&/-]{1,40}(?:\s*,\s*[A-Za-z][\w '&/-]{1,40})+\s*,?\s*or\s*[A-Za-z][\w '&/-]{1,40})\s*\??\s*$/i)
    || tail.match(/([A-Za-z][\w '&/-]{1,40}\s+or\s+[A-Za-z][\w '&/-]{1,40})\s*\??\s*$/i);

  if (orMatch) {
    const raw = orMatch[1];
    const parts = raw
      .split(/\s*,\s*|\s+or\s+/i)
      .map((p) => p.trim().replace(/^["'`]|["'`]$/g, ""))
      .filter((p) => p && p.length <= 32 && !/^(the|a|an|and|with|for|on|of)$/i.test(p));
    const unique = Array.from(new Set(parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1))));
    if (unique.length >= 2 && unique.length <= 6) return unique;
  }

  // Pattern: quoted suggestions like "ribeye", "filet", "brisket"
  const quoted = Array.from(cleaned.matchAll(/["'`]([A-Za-z][\w &'/-]{1,32})["'`]/g)).map((m) => m[1]);
  if (quoted.length >= 2 && quoted.length <= 6) {
    const unique = Array.from(new Set(quoted.map((p) => p.charAt(0).toUpperCase() + p.slice(1))));
    if (unique.length >= 2) return unique;
  }

  return null;
}

// Order matters — date/guests must run BEFORE the generic "event type" group.
const CHIP_GROUPS: ChipGroup[] = [
  { kind: "guests",
    match: /\b(how many (guests|people|attendees)|guest count|number of (guests|people)|approximate (guest|head) count)\b/i },
  { kind: "text", match: /\b(service style|buffet|plated|family[- ]style|cocktail reception|how.*served|style of service)\b/i,
    chips: ["Buffet", "Plated", "Family Style", "Cocktail Reception"] },
  { kind: "text", match: /\b(menu style|meat|seafood|vegetarian|mixed menu|what kind of (food|menu)|cuisine direction)\b/i,
    chips: ["Meat & Poultry", "Seafood", "Vegetarian", "Mixed Menu"] },
  { kind: "text", match: /\b(tier|silver|gold|platinum|package|budget level)\b/i,
    chips: ["Silver", "Gold", "Platinum"] },
  { kind: "text", match: /\b(allerg|dietary|restriction|intoleran)/i,
    chips: ["None", "Gluten", "Dairy", "Nuts", "Shellfish", "Soy", "Eggs"] },
  { kind: "text", match: /\b(spice|spicy|heat level|how spicy)\b/i,
    chips: ["Mild", "Medium", "Spicy", "Extra spicy"] },
  { kind: "text", match: /\b(vibe|mood|atmosphere|formal|casual|elegant|rustic)\b/i,
    chips: ["Casual", "Elegant", "Rustic", "Formal", "Festive"] },
  { kind: "text", match: /\b(alcohol|bar|drinks|beer|wine|cocktail|liquor)\b/i,
    chips: ["No alcohol", "Beer & wine only", "Full bar", "Signature cocktail"] },
  { kind: "text", match: /\b(event type|occasion type|kind of event|type of (event|celebration)|what are we celebrating)\b/i,
    chips: ["Wedding", "Birthday", "Corporate", "Anniversary", "Holiday party"] },
  { kind: "text", match: /\b(which meats?|cuts? of (beef|meat)|beef cut|favorite meats?)\b/i,
    chips: ["Chicken", "Beef", "Pork", "Lamb", "Ribeye", "Filet", "Brisket"] },
  { kind: "text", match: /\b(which seafood|fish|shrimp|crab|lobster)\b/i,
    chips: ["Fish", "Shrimp", "Crab", "Lobster", "Salmon", "Tuna"] },
  { kind: "text", match: /\b(sound good|sound right|confirm|correct\?|ready to|shall we|would you like)\b/i,
    chips: ["Yes", "No", "Not sure"] },
];

// Extract just the last question from the assistant message so chips reflect
// what's actively being ASKED, not topics merely mentioned in a recap or confirmation.
function lastQuestion(text: string): string | null {
  if (!text || !text.includes("?")) return null;
  // Split into sentences, keep ones ending with "?"
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().endsWith("?"));
  if (sentences.length === 0) return null;
  return sentences[sentences.length - 1];
}

function suggestChipGroup(text: string): ChipGroup | null {
  const question = lastQuestion(text);
  if (!question) return null;
  for (const group of CHIP_GROUPS) {
    if (group.match && group.match.test(question)) return group;
  }
  // Fallback: derive chips directly from the question wording.
  const auto = autoChipsFromQuestion(question);
  if (auto) return { kind: "text", chips: auto };
  return null;
}

function deepMergePreferences(base: QuotePreferences | undefined, incoming: QuotePreferences): QuotePreferences {
  const out: QuotePreferences = { ...(base || {}), ...incoming };
  if (base?.alcohol || incoming.alcohol) {
    out.alcohol = { ...(base?.alcohol || {}), ...(incoming.alcohol || {}) };
  }
  return out;
}

function AIQuotePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selections, setSelections] = useState<QuoteSelections>({ ...INITIAL_SELECTIONS });
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [savedPulse, setSavedPulse] = useState(0);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (savedPulse === 0) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1600);
    return () => clearTimeout(t);
  }, [savedPulse]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [slow, setSlow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<ChatMsg[] | null>(null);
  const lastPrefilledRef = useRef<Partial<QuoteSelections> | null | undefined>(undefined);

  // Hydrate from handoff (basic -> AI) and seed a single concise opener
  useEffect(() => {
    if (hydrated) return;
    let prefilled: Partial<QuoteSelections> | null = null;
    try {
      const raw = sessionStorage.getItem("quote_handoff");
      if (raw) {
        prefilled = JSON.parse(raw);
        sessionStorage.removeItem("quote_handoff");
        if (prefilled) setSelections((s) => ({ ...s, ...prefilled }));
      }
    } catch {}
    setHydrated(true);

    const hasPrefill = !!prefilled && Object.values(prefilled).some((v) => v && (Array.isArray(v) ? v.length : true));
    const fullName = (user?.user_metadata?.full_name as string | undefined) || (user?.email ?? "");
    const firstName = fullName.trim().split(/[\s@]/)[0];
    const cleanFirst = firstName && /^[A-Za-z'-]+$/.test(firstName)
      ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
      : "";
    const greeting = cleanFirst ? `Hi ${cleanFirst}!` : "Hi!";
    const opener = hasPrefill
      ? `${greeting} I've got your draft from the basic builder. To pick up where you left off — what's the event date?`
      : `${greeting} I'm your catering concierge. To get started, what kind of event are we celebrating?`;
    setMessages([{ role: "assistant", content: opener }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendToAI(currentMessages: ChatMsg[], prefilled?: Partial<QuoteSelections> | null) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastSentRef.current = currentMessages;
    lastPrefilledRef.current = prefilled;

    setLoading(true);
    setSlow(false);
    setError(null);
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setSlow(true), 10000);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quote-assistant`;
      const apiMessages =
        currentMessages.length === 0
          ? [
              {
                role: "user",
                content: prefilled && Object.values(prefilled).some((v) => v && (Array.isArray(v) ? v.length : true))
                  ? "Hi! I started filling out a quote in the basic builder. Please pick up from where I left off."
                  : "Hi! I'd like help building a catering quote for my event.",
              },
            ]
          : currentMessages;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: apiMessages, prefilled: prefilled ?? selections }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        if (resp.status === 429) setError("Too many requests. Please wait a moment.");
        else if (resp.status === 402) setError("AI credits exhausted. Please add credits in your workspace.");
        else setError("Something went wrong with the assistant.");
        return;
      }
      if (!resp.body) {
        setError("No response stream.");
        return;
      }

      // Add empty assistant message that we'll fill
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantSoFar = "";
      // tool call accumulators by index
      const toolCallAccum: Record<number, { name: string; args: string }> = {};
      let done = false;

      const flushToolCalls = () => {
        Object.values(toolCallAccum).forEach((tc) => {
          if (tc.name === "update_quote_draft" && tc.args) {
            try {
              const parsed = JSON.parse(tc.args);
              console.log("[quote-ai] tool call parsed:", parsed);
              setSelections((prev) => {
                const next: QuoteSelections = { ...prev };
                let changed = false;
                for (const [k, v] of Object.entries(parsed)) {
                  if (v === null || v === undefined) continue;
                  // Skip empty strings/arrays so the model can't accidentally clear prior values
                  if (typeof v === "string" && v.trim() === "") continue;
                  if (Array.isArray(v) && v.length === 0) continue;
                  if (k === "preferences" && typeof v === "object") {
                    next.preferences = deepMergePreferences(prev.preferences, v as QuotePreferences);
                    changed = true;
                  } else {
                    (next as any)[k] = v;
                    changed = true;
                  }
                }
                console.log("[quote-ai] selections after merge:", next);
                if (changed) setSavedPulse((n) => n + 1);
                return next;
              });
            } catch (e) {
              console.warn("Failed to parse tool args", e, tc.args);
            }
          }
        });
      };

      while (!done) {
        const { done: rDone, value } = await reader.read();
        if (rDone) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              assistantSoFar += delta.content;
              setMessages((prev) => {
                const out = [...prev];
                out[out.length - 1] = { role: "assistant", content: assistantSoFar };
                return out;
              });
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallAccum[idx]) toolCallAccum[idx] = { name: "", args: "" };
                if (tc.function?.name) toolCallAccum[idx].name = tc.function.name;
                if (tc.function?.arguments) toolCallAccum[idx].args += tc.function.arguments;
              }
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      flushToolCalls();
    } catch (e: any) {
      if (e?.name === "AbortError") {
        // user cancelled — drop the empty assistant placeholder if present
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
          return prev;
        });
      } else {
        console.error(e);
        setError("Network error. Please try again.");
      }
    } finally {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setSlow(false);
      setLoading(false);
      abortRef.current = null;
    }
  }

  const stop = () => {
    abortRef.current?.abort();
  };

  const retry = () => {
    if (lastSentRef.current) {
      // remove any trailing empty assistant placeholder before retrying
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
        return prev;
      });
      void sendToAI(lastSentRef.current, lastPrefilledRef.current);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    await sendToAI(next);
  };

  const sendChip = async (text: string) => {
    if (loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    await sendToAI(next);
  };

  const switchToBasic = () => {
    sessionStorage.setItem("quote_handoff", JSON.stringify(selections));
    navigate({ to: "/quote" });
  };

  const reviewAndSubmit = () => {
    sessionStorage.setItem("quote_handoff", JSON.stringify(selections));
    sessionStorage.setItem("quote_handoff_jump_review", "1");
    try {
      sessionStorage.setItem("quote_handoff_transcript", JSON.stringify(messages));
    } catch {}
    navigate({ to: "/quote" });
  };

  const canReview =
    !!selections.style &&
    selections.guestCount > 0 &&
    !!selections.eventDate &&
    !!selections.clientName &&
    !!selections.clientEmail;

  const prefs = selections.preferences || {};

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="flex-1 pt-20 pb-8 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Mode header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Badge className="bg-gradient-warm text-primary-foreground gap-1">
                <Sparkles className="w-3 h-3" /> Advanced AI Builder
              </Badge>
              <span className="text-xs text-muted-foreground hidden sm:inline">Conversational quote builder</span>
            </div>
            <button onClick={switchToBasic} className="text-xs text-primary hover:underline flex items-center gap-1">
              <ArrowLeftRight className="w-3 h-3" /> Switch to Basic Builder
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Chat */}
            <Card className="lg:col-span-2 flex flex-col h-[70vh] shadow-warm">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && loading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Starting conversation…
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                        m.role === "user"
                          ? "bg-gradient-warm text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert [&>*]:my-1">
                          <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (() => {
                  const last = messages[messages.length - 1];
                  const showThinking =
                    !last ||
                    last.role === "user" ||
                    (last.role === "assistant" && !last.content);
                  if (!showThinking) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {slow ? "Still thinking… this is taking a while" : "Thinking…"}
                      </span>
                      {slow && (
                        <button
                          type="button"
                          onClick={stop}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors"
                        >
                          <X className="w-3.5 h-3.5" /> Stop
                        </button>
                      )}
                    </div>
                  );
                })()}
                {/* Quick replies for the most recent assistant question */}
                {!loading && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" && (() => {
                  const group = suggestChipGroup(messages[messages.length - 1].content);
                  if (!group) return null;
                  if (group.kind === "date") {
                    return (
                      <div className="pt-1">
                        <DateChip onPick={(iso) => void sendChip(iso)} />
                      </div>
                    );
                  }
                  if (group.kind === "guests") {
                    return (
                      <div className="pt-1">
                        <GuestsChip onSubmit={(n) => void sendChip(String(n))} />
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {group.chips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => void sendChip(chip)}
                          className="text-xs font-medium px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground transition-colors active:scale-95"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {error && (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-destructive">{error}</p>
                    {lastSentRef.current && (
                      <button
                        type="button"
                        onClick={retry}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Retry
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="border-t p-3 flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Type your reply…"
                  disabled={loading}
                />
                <Button onClick={send} disabled={loading || !input.trim()} className="bg-gradient-warm text-primary-foreground gap-1">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </Card>

            {/* Live summary */}
            <Card className="h-fit lg:sticky lg:top-24">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold">Event Summary</h3>
                  <span
                    aria-live="polite"
                    className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary transition-all duration-300",
                      showSaved ? "opacity-100 scale-100 animate-fade-in" : "opacity-0 scale-95 pointer-events-none",
                    )}
                  >
                    ● Saved
                  </span>
                </div>
                <SummaryRow label="Style" value={selections.style} />
                <SummaryRow label="Proteins" value={selections.proteins.join(", ")} />
                <SummaryRow label="Service" value={selections.serviceStyle} />
                <SummaryRow label="Tier" value={selections.tier} />
                <SummaryRow label="Guests" value={selections.guestCount ? String(selections.guestCount) : ""} />
                <SummaryRow label="Date" value={selections.eventDate} />
                <SummaryRow label="Event" value={selections.eventType} />
                <SummaryRow label="Allergies" value={selections.allergies.join(", ")} />
                <SummaryRow label="Extras" value={selections.extras.join(", ")} />
                <SummaryRow label="Add-ons" value={selections.addons.join(", ")} />
                <SummaryRow label="Name" value={selections.clientName} />
                <SummaryRow label="Email" value={selections.clientEmail} />
                <SummaryRow label="Venue" value={selections.locationName} />

                {(prefs.proteinDetails || prefs.vegetableNotes || prefs.cuisineLean || prefs.spiceLevel || prefs.vibe || prefs.alcohol || prefs.notes) && (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preferences</p>
                    <SummaryRow label="Protein notes" value={prefs.proteinDetails} />
                    <SummaryRow label="Veggies" value={prefs.vegetableNotes} />
                    <SummaryRow label="Cuisine lean" value={prefs.cuisineLean} />
                    <SummaryRow label="Spice" value={prefs.spiceLevel} />
                    <SummaryRow label="Vibe" value={prefs.vibe} />
                    {prefs.alcohol && (
                      <>
                        <SummaryRow label="Beer" value={prefs.alcohol.beer} />
                        <SummaryRow label="Wine" value={prefs.alcohol.wine} />
                        <SummaryRow label="Spirits" value={prefs.alcohol.spirits} />
                        <SummaryRow label="Signature cocktail" value={prefs.alcohol.signatureCocktail} />
                      </>
                    )}
                    <SummaryRow label="Notes" value={prefs.notes} />
                  </div>
                )}

                <Button
                  onClick={reviewAndSubmit}
                  disabled={!canReview}
                  className="w-full bg-gradient-warm text-primary-foreground mt-2"
                >
                  Review & Submit
                </Button>
                {!canReview && (
                  <p className="text-xs text-muted-foreground text-center">
                    Need: style, guests, date, name, email
                  </p>
                )}
                <Link to="/quote" className="block text-xs text-center text-muted-foreground hover:text-primary">
                  Prefer step-by-step? Use Basic Builder
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right capitalize">{value}</span>
    </div>
  );
}

function DateChip({ onPick }: { onPick: (iso: string) => void }) {
  const [date, setDate] = useState<Date | undefined>();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground transition-colors active:scale-95"
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          {date ? format(date, "PPP") : "Pick a date"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (!d) return;
            setDate(d);
            setOpen(false);
            const iso = format(d, "yyyy-MM-dd");
            onPick(iso);
          }}
          disabled={(d) => d < new Date(new Date().toDateString())}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

function GuestsChip({ onSubmit }: { onSubmit: (n: number) => void }) {
  const [val, setVal] = useState("");
  const presets = [25, 50, 75, 100, 150, 200];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onSubmit(n)}
          className="text-xs font-medium px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground transition-colors active:scale-95"
        >
          {n}
        </button>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Custom"
          className="w-20 text-xs px-2 py-1.5 rounded-full border border-primary/30 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          disabled={!val || Number(val) < 1}
          onClick={() => {
            const n = Number(val);
            if (n >= 1) onSubmit(n);
          }}
          className="text-xs font-medium px-3 py-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
