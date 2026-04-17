import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Task = {
  id: string;
  title: string;
  source: "auto" | "manual";
  completed: boolean;
};

export function PrepChecklist({ quoteId, userId }: { quoteId: string; userId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await (supabase as any)
      .from("event_prep_tasks")
      .select("id, title, source, completed")
      .eq("quote_id", quoteId)
      .order("source", { ascending: true })
      .order("created_at", { ascending: true });
    setTasks((data as Task[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [quoteId]);

  const toggle = async (t: Task) => {
    const next = !t.completed;
    setTasks((p) => p.map((x) => (x.id === t.id ? { ...x, completed: next } : x)));
    const { error } = await (supabase as any)
      .from("event_prep_tasks")
      .update({
        completed: next,
        completed_at: next ? new Date().toISOString() : null,
        completed_by: next ? userId : null,
      })
      .eq("id", t.id);
    if (error) {
      toast.error("Could not update task");
      load();
    }
  };

  const addTask = async () => {
    if (!newTitle.trim()) return;
    const { error } = await (supabase as any)
      .from("event_prep_tasks")
      .insert({ quote_id: quoteId, title: newTitle.trim(), source: "manual", created_by: userId });
    if (error) return toast.error(error.message);
    setNewTitle("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("event_prep_tasks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const done = tasks.filter((t) => t.completed).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {done} of {tasks.length} done
      </p>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 p-2 rounded-md border border-border/50 bg-card"
          >
            <Checkbox checked={t.completed} onCheckedChange={() => toggle(t)} />
            <span className={`flex-1 text-sm ${t.completed ? "line-through text-muted-foreground" : ""}`}>
              {t.title}
            </span>
            {t.source === "manual" && (
              <button
                onClick={() => remove(t.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Delete task"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No tasks yet.</p>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Add a task…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
        />
        <Button size="sm" onClick={addTask} disabled={!newTitle.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
