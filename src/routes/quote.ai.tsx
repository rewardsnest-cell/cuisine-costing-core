import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, ArrowLeftRight, Loader2 } from "lucide-react";
import { INITIAL_SELECTIONS, type QuoteSelections, type QuotePreferences } from "@/components/quote/types";

export const Route = createFileRoute("/quote/ai")({
  head: () => ({
    meta: [
      { title: "Advanced AI Quote Builder — TasteQuote" },
      { name: "description", content: "Chat with our AI to build your custom catering quote — natural conversation, granular preferences, alcohol pairings, and more." },
    ],
  }),
  component: AIQuotePage,
});

type ChatMsg = { role: "user" | "assistant"; content: string };

const CHIP_GROUPS: { match: RegExp; chips: string[] }[] = [
  { match: /\b(service style|buffet|plated|family[- ]style|cocktail reception|how.*served|style of service)\b/i,
    chips: ["Buffet", "Plated", "Family Style", "Cocktail Reception"] },
  { match: /\b(menu style|meat|seafood|vegetarian|mixed menu|what kind of (food|menu)|cuisine direction)\b/i,
    chips: ["Meat & Poultry", "Seafood", "Vegetarian", "Mixed Menu"] },
  { match: /\b(tier|silver|gold|platinum|package|budget level)\b/i,
    chips: ["Silver", "Gold", "Platinum"] },
  { match: /\b(allerg|dietary|restriction|intoleran)/i,
    chips: ["None", "Gluten", "Dairy", "Nuts", "Shellfish", "Soy", "Eggs"] },
  { match: /\b(spice|spicy|heat level|how spicy)\b/i,
    chips: ["Mild", "Medium", "Spicy", "Extra spicy"] },
  { match: /\b(vibe|mood|atmosphere|formal|casual|elegant|rustic)\b/i,
    chips: ["Casual", "Elegant", "Rustic", "Formal", "Festive"] },
  { match: /\b(alcohol|bar|drinks|beer|wine|cocktail|liquor)\b/i,
    chips: ["No alcohol", "Beer & wine only", "Full bar", "Signature cocktail"] },
  { match: /\b(event type|occasion|wedding|birthday|corporate|anniversary)\b/i,
    chips: ["Wedding", "Birthday", "Corporate", "Anniversary", "Holiday party"] },
  { match: /\b(which meats?|cuts? of (beef|meat)|beef cut|favorite meats?)\b/i,
    chips: ["Chicken", "Beef", "Pork", "Lamb", "Ribeye", "Filet", "Brisket"] },
  { match: /\b(which seafood|fish|shrimp|crab|lobster)\b/i,
    chips: ["Fish", "Shrimp", "Crab", "Lobster", "Salmon", "Tuna"] },
  { match: /\b(sound good|sound right|confirm|correct\?|ready to|shall we|would you like)\b/i,
    chips: ["Yes", "No", "Not sure"] },
];

function suggestChips(text: string): string[] {
  if (!text) return [];
  const tail = text.split(/(?<=[.?!])\s+/).slice(-2).join(" ");
  for (const group of CHIP_GROUPS) {
    if (group.match.test(tail)) return group.chips;
  }
  return [];
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
  const [selections, setSelections] = useState<QuoteSelections>({ ...INITIAL_SELECTIONS });
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate from handoff (basic -> AI) and trigger first AI message
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
    // Kick off greeting
    void sendToAI([], prefilled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendToAI(currentMessages: ChatMsg[], prefilled?: Partial<QuoteSelections> | null) {
    setLoading(true);
    setError(null);
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
      });

      if (!resp.ok) {
        if (resp.status === 429) setError("Too many requests. Please wait a moment.");
        else if (resp.status === 402) setError("AI credits exhausted. Please add credits in your workspace.");
        else setError("Something went wrong with the assistant.");
        setLoading(false);
        return;
      }
      if (!resp.body) {
        setError("No response stream.");
        setLoading(false);
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
              setSelections((prev) => {
                const next: QuoteSelections = { ...prev };
                for (const [k, v] of Object.entries(parsed)) {
                  if (v === null || v === undefined) continue;
                  if (k === "preferences" && typeof v === "object") {
                    next.preferences = deepMergePreferences(prev.preferences, v as QuotePreferences);
                  } else {
                    (next as any)[k] = v;
                  }
                }
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
    } catch (e) {
      console.error(e);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
                {loading && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                  </div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
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
                <h3 className="font-display text-lg font-semibold">Event Summary</h3>
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
