import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, ArrowLeftRight, Loader2 } from "lucide-react";
import { INITIAL_SELECTIONS } from "@/components/quote/types";

type Msg = { role: "user" | "assistant"; content: string };

export const Route = createFileRoute("/quote_/ai")({
  head: () => ({
    meta: [
      { title: "AI Catering Concierge — VPS Finest" },
      { name: "description", content: "Chat with our AI catering concierge to design your perfect event menu." },
    ],
  }),
  component: QuoteAiPage,
});

function QuoteAiPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your catering concierge. Tell me about your event — what are we celebrating, and roughly when and how many guests?",
    },
  ]);
  const [draft, setDraft] = useState<Record<string, any>>({ ...INITIAL_SELECTIONS });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quote-assistant`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: next, prefilled: draft }),
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      const toolArgs: Record<number, string> = {};
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) {
              assistantText += delta.content;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                toolArgs[idx] = (toolArgs[idx] || "") + (tc.function?.arguments || "");
              }
            }
          } catch {}
        }
      }

      // Apply any tool-call updates to draft
      for (const args of Object.values(toolArgs)) {
        try {
          const parsed = JSON.parse(args);
          setDraft((d) => ({ ...d, ...parsed }));
        } catch {}
      }
    } catch (err) {
      console.error("AI error:", err);
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I had trouble responding. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handoffToReview = () => {
    sessionStorage.setItem("quote_handoff", JSON.stringify(draft));
    sessionStorage.setItem("quote_handoff_transcript", JSON.stringify(messages));
    sessionStorage.setItem("quote_handoff_jump_review", "1");
    navigate({ to: "/catering/quote" });
  };

  const switchToBasic = () => {
    sessionStorage.setItem("quote_handoff", JSON.stringify(draft));
    navigate({ to: "/catering/quote" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="flex-1 pt-24 pb-32 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="w-3 h-3" /> AI Concierge
            </Badge>
            <button
              onClick={switchToBasic}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Switch to Quick Builder <ArrowLeftRight className="w-3 h-3" />
            </button>
          </div>

          <Card className="mb-4">
            <CardContent className="p-0">
              <div ref={scrollRef} className="h-[60vh] overflow-y-auto p-4 space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {m.content || (loading && i === messages.length - 1 ? "…" : "")}
                    </div>
                  </div>
                ))}
                {loading && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl px-4 py-2 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your reply…"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()} className="gap-1">
              <Send className="w-4 h-4" />
            </Button>
          </form>

          <div className="flex justify-center mt-4">
            <Button variant="outline" size="sm" onClick={handoffToReview}>
              Review &amp; Submit
            </Button>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
