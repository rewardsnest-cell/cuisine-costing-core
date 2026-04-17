import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Play, Square, Clock } from "lucide-react";
import { toast } from "sonner";

type Entry = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
};

function fmtDuration(ms: number) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export function TimeClock({ quoteId, userId }: { quoteId: string; userId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await (supabase as any)
      .from("event_time_entries")
      .select("id, clock_in_at, clock_out_at")
      .eq("quote_id", quoteId)
      .eq("employee_user_id", userId)
      .order("clock_in_at", { ascending: false });
    setEntries((data as Entry[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [quoteId, userId]);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);

  const open = entries.find((e) => !e.clock_out_at);

  const clockIn = async () => {
    const { error } = await (supabase as any)
      .from("event_time_entries")
      .insert({ quote_id: quoteId, employee_user_id: userId });
    if (error) return toast.error(error.message);
    toast.success("Clocked in");
    load();
  };

  const clockOut = async () => {
    if (!open) return;
    const { error } = await (supabase as any)
      .from("event_time_entries")
      .update({ clock_out_at: new Date().toISOString() })
      .eq("id", open.id);
    if (error) return toast.error(error.message);
    toast.success("Clocked out");
    load();
  };

  const totalMs = entries.reduce((sum, e) => {
    const end = e.clock_out_at ? new Date(e.clock_out_at).getTime() : now;
    return sum + (end - new Date(e.clock_in_at).getTime());
  }, 0);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-card">
        <div>
          <p className="text-xs text-muted-foreground">Total worked</p>
          <p className="font-display text-2xl font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            {fmtDuration(totalMs)}
          </p>
        </div>
        {open ? (
          <Button onClick={clockOut} variant="destructive" className="gap-2">
            <Square className="w-4 h-4" /> Clock Out
          </Button>
        ) : (
          <Button onClick={clockIn} className="bg-gradient-warm text-primary-foreground gap-2">
            <Play className="w-4 h-4" /> Clock In
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No shifts logged yet.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => {
            const start = new Date(e.clock_in_at);
            const end = e.clock_out_at ? new Date(e.clock_out_at) : null;
            const dur = (end ? end.getTime() : now) - start.getTime();
            return (
              <div
                key={e.id}
                className="flex items-center justify-between gap-2 text-xs p-2 rounded border border-border/40"
              >
                <span>
                  {start.toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  {" → "}
                  {end ? end.toLocaleTimeString([], { timeStyle: "short" }) : (
                    <span className="text-primary font-medium">in progress</span>
                  )}
                </span>
                <span className="font-mono">{fmtDuration(dur)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
