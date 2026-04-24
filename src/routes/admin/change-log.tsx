import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Archive, Eye, FileText, NotebookPen, Pencil, Plus, Sparkles, CheckCircle2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { generateChangeLogDrafts } from "@/lib/server-fns/change-log-auto.functions";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/change-log")({
  head: () => ({
    meta: [
      { title: "Change Log — Admin" },
      { name: "description", content: "Human-curated history of significant operational decisions." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ChangeLogPage,
});

type ChangeLogEntry = {
  id: string;
  title: string;
  summary: string;
  linked_audit_event_ids: string[];
  archived: boolean;
  archived_at: string | null;
  author_user_id: string | null;
  author_email: string | null;
  status: "draft" | "published" | "archived";
  auto_generated: boolean;
  created_at: string;
  updated_at: string;
};

function ChangeLogPage() {
  const { user } = useAuth();
  const generateDrafts = useServerFn(generateChangeLogDrafts);
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ChangeLogEntry | null>(null);

  const [detail, setDetail] = useState<ChangeLogEntry | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("change_log_entries")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setEntries((data ?? []) as ChangeLogEntry[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(
    () => entries.filter((e) => (showArchived ? true : !e.archived)),
    [entries, showArchived],
  );

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (e: ChangeLogEntry) => {
    setEditing(e);
    setEditorOpen(true);
  };

  const archive = async (entry: ChangeLogEntry) => {
    const { error } = await supabase
      .from("change_log_entries")
      .update({ archived: true, archived_at: new Date().toISOString() })
      .eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Entry archived");
    load();
  };

  const unarchive = async (entry: ChangeLogEntry) => {
    const { error } = await supabase
      .from("change_log_entries")
      .update({ archived: false, archived_at: null, status: "published" })
      .eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Entry restored");
    load();
  };

  const publish = async (entry: ChangeLogEntry) => {
    const { error } = await supabase
      .from("change_log_entries")
      .update({ status: "published" })
      .eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Draft published");
    load();
  };

  const handleGenerateDrafts = async () => {
    setGenerating(true);
    try {
      const res = await generateDrafts();
      toast.success(res.message);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate drafts");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <NotebookPen className="w-5 h-5 text-muted-foreground" />
            <h1 className="font-display text-2xl font-bold">Change Log — Summary of Significant Operational Decisions</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Human-authored narrative layered on top of the audit log. Entries cannot be deleted, only archived.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGenerateDrafts} disabled={generating}>
            <Sparkles className="w-4 h-4 mr-2" />
            {generating ? "Scanning…" : "Generate drafts from audit"}
          </Button>
          <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> New entry
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState label="Loading change log…" />
          ) : error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : visible.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No change log entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Title</th>
                    <th className="p-3 font-medium">Author</th>
                    <th className="p-3 font-medium">Linked events</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{e.title}</span>
                          {e.auto_generated && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Sparkles className="w-3 h-3" /> System-generated
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-xs">{e.author_email ?? "—"}</td>
                      <td className="p-3 text-xs">{e.linked_audit_event_ids.length}</td>
                      <td className="p-3">
                        {e.archived ? (
                          <Badge variant="secondary">Archived</Badge>
                        ) : e.status === "draft" ? (
                          <Badge variant="secondary">Draft</Badge>
                        ) : (
                          <Badge variant="outline">Published</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setDetail(e)} title="View"><Eye className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(e)} title="Edit"><Pencil className="w-4 h-4" /></Button>
                          {e.status === "draft" && !e.archived && (
                            <Button size="sm" variant="ghost" onClick={() => publish(e)} title="Publish">
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                          )}
                          {e.archived ? (
                            <Button size="sm" variant="ghost" onClick={() => unarchive(e)} title="Restore">
                              <FileText className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => archive(e)} title="Archive">
                              <Archive className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ChangeLogEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        entry={editing}
        currentUser={user}
        onSaved={() => {
          setEditorOpen(false);
          load();
        }}
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Author</p>
                  <p>{detail.author_email ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p>{new Date(detail.created_at).toLocaleString()}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Summary</p>
                <p className="whitespace-pre-wrap">{detail.summary || <span className="text-muted-foreground">No summary provided.</span>}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Linked audit events ({detail.linked_audit_event_ids.length})</p>
                {detail.linked_audit_event_ids.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None linked.</p>
                ) : (
                  <div className="space-y-1">
                    {detail.linked_audit_event_ids.map((id) => (
                      <div key={id} className="flex items-center justify-between gap-2 text-xs">
                        <code className="font-mono break-all">{id}</code>
                      </div>
                    ))}
                    <Link
                      to="/admin/audit"
                      search={{ ids: detail.linked_audit_event_ids.join(",") } as any}
                      className="inline-block mt-2 text-primary text-xs hover:underline"
                    >
                      Open in Audit Log →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChangeLogEditor({
  open,
  onOpenChange,
  entry,
  currentUser,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: ChangeLogEntry | null;
  currentUser: { id: string; email?: string | null } | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [linkedRaw, setLinkedRaw] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(entry?.title ?? "");
      setSummary(entry?.summary ?? "");
      setLinkedRaw((entry?.linked_audit_event_ids ?? []).join("\n"));
    }
  }, [open, entry]);

  const save = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const ids = linkedRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      title: title.trim(),
      summary: summary.trim(),
      linked_audit_event_ids: ids,
    };

    let err: { message: string } | null = null;
    if (entry) {
      const { error } = await supabase
        .from("change_log_entries")
        .update(payload)
        .eq("id", entry.id);
      err = error;
    } else {
      const { error } = await supabase.from("change_log_entries").insert({
        ...payload,
        author_user_id: currentUser?.id ?? null,
        author_email: currentUser?.email ?? null,
      });
      err = error;
    }
    setSaving(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success(entry ? "Entry updated" : "Entry created");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit change log entry" : "New change log entry"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q2 pricing model activation" />
          </div>
          <div>
            <Label>Summary (why this change was made)</Label>
            <Textarea
              rows={6}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Narrative context for the decision…"
            />
          </div>
          <div>
            <Label>Linked audit event IDs</Label>
            <Textarea
              rows={3}
              value={linkedRaw}
              onChange={(e) => setLinkedRaw(e.target.value)}
              placeholder="Paste one or more audit IDs (whitespace or comma separated)"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Find IDs in the Audit Log detail view. They will be linkable from this entry.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
