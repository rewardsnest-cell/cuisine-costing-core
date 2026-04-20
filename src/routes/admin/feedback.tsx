import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, ExternalLink, Inbox, CheckCircle2, Archive } from "lucide-react";
import { toast } from "sonner";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/feedback")({
  head: () => ({ meta: [{ title: "Feedback Inbox — VPS Finest Admin" }] }),
  component: FeedbackInbox,
});

interface Row {
  id: string;
  user_id: string | null;
  email: string | null;
  message: string;
  page_url: string | null;
  rating: number | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

function FeedbackInbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "in_progress" | "resolved" | "archived">("new");
  const [q, setQ] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("feedback")
      .select("id,user_id,email,message,page_url,rating,status,admin_notes,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows(data || []);
    setLoading(false);
  }

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (q.trim()) {
        const t = q.trim().toLowerCase();
        if (
          !r.message.toLowerCase().includes(t) &&
          !(r.email || "").toLowerCase().includes(t) &&
          !(r.page_url || "").toLowerCase().includes(t)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, filter, q]);

  async function setStatus(id: string, status: string) {
    const { error } = await (supabase as any).from("feedback").update({ status }).eq("id", id);
    if (error) {
      toast.error("Could not update.");
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success(`Marked ${status.replace("_", " ")}`);
  }

  async function saveNotes(id: string, admin_notes: string) {
    const { error } = await (supabase as any).from("feedback").update({ admin_notes }).eq("id", id);
    if (error) {
      toast.error("Could not save note.");
      return;
    }
    toast.success("Note saved");
  }

  const counts = useMemo(() => {
    const c = { all: rows.length, new: 0, in_progress: 0, resolved: 0, archived: 0 } as Record<string, number>;
    rows.forEach((r) => {
      if (c[r.status] !== undefined) c[r.status] += 1;
    });
    return c;
  }, [rows]);

  return (
    <div className="space-y-5">
      <PageHelpCard route="/admin/feedback" />
      <div className="flex items-start gap-3">
        <Inbox className="w-5 h-5 text-primary mt-1" aria-hidden="true" />
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Feedback Inbox</h2>
          <p className="text-sm text-muted-foreground">Notes left by visitors and signed-in customers.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["new", "in_progress", "resolved", "archived", "all"] as const).map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
            className="gap-1.5"
          >
            {s.replace("_", " ")}
            <Badge variant="secondary" className="ml-0.5 text-[10px]">
              {counts[s] ?? 0}
            </Badge>
          </Button>
        ))}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search messages, email, page…"
          className="ml-auto max-w-xs"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">No feedback in this view.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <FeedbackCard key={r.id} row={r} onStatus={setStatus} onSaveNotes={saveNotes} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackCard({
  row,
  onStatus,
  onSaveNotes,
}: {
  row: Row;
  onStatus: (id: string, s: string) => void;
  onSaveNotes: (id: string, n: string) => void;
}) {
  const [notes, setNotes] = useState(row.admin_notes || "");
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={row.status === "new" ? "default" : "secondary"}>{row.status.replace("_", " ")}</Badge>
            {row.rating ? (
              <span className="inline-flex items-center gap-0.5 text-xs text-accent" aria-label={`${row.rating} stars`}>
                {Array.from({ length: row.rating }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-accent text-accent" aria-hidden="true" />
                ))}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
            {row.email ? <span className="text-xs text-muted-foreground">· {row.email}</span> : null}
            {row.page_url ? (
              <a
                href={row.page_url}
                className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                target="_blank"
                rel="noopener noreferrer"
              >
                {row.page_url} <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          <div className="flex gap-1.5">
            {row.status !== "in_progress" && (
              <Button size="sm" variant="outline" onClick={() => onStatus(row.id, "in_progress")}>
                In progress
              </Button>
            )}
            {row.status !== "resolved" && (
              <Button size="sm" variant="outline" onClick={() => onStatus(row.id, "resolved")} className="gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Resolve
              </Button>
            )}
            {row.status !== "archived" && (
              <Button size="sm" variant="ghost" onClick={() => onStatus(row.id, "archived")} className="gap-1">
                <Archive className="w-3.5 h-3.5" aria-hidden="true" /> Archive
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{row.message}</p>
        <div className="flex items-end gap-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes…"
            rows={2}
            className="text-xs"
          />
          <Button size="sm" variant="outline" onClick={() => onSaveNotes(row.id, notes)}>
            Save note
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
