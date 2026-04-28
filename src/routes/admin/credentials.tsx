import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Lock, Plus, Eye, RefreshCw, Ban, Copy, Check, ShieldCheck, History, ExternalLink, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/credentials")({
  head: () => ({
    meta: [
      { title: "Credentials Vault — Admin" },
      { name: "description", content: "Internal admin-only credentials vault." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CredentialsVaultPage,
});

interface VaultRow {
  id: string;
  label: string;
  category: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  status: "active" | "revoked";
  secret_preview: string | null;
  rotated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditRow {
  id: string;
  credential_id: string | null;
  action: string;
  actor_email: string | null;
  created_at: string;
}

const CATEGORIES = ["general", "amazon", "tiktok", "meta", "stripe", "google", "email", "hosting", "database", "other"];

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function CredentialsVaultPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "revoked">("active");

  // Reveal flow
  const [reauthFor, setReauthFor] = useState<VaultRow | null>(null);
  const [reauthPassword, setReauthPassword] = useState("");
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState<{ row: VaultRow; secret: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(30);

  // Add/edit/rotate dialog
  const [editing, setEditing] = useState<VaultRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showRotate, setShowRotate] = useState<VaultRow | null>(null);
  const [form, setForm] = useState({ label: "", category: "general", username: "", url: "", notes: "", secret: "" });
  const [working, setWorking] = useState(false);

  // Audit log
  const [showAudit, setShowAudit] = useState<VaultRow | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);

  const loadRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("credentials_vault" as any)
      .select("id,label,category,username,url,notes,status,secret_preview,rotated_at,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Could not load vault", { description: error.message });
      setRows([]);
    } else {
      setRows((data as any) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { void loadRows(); }, []);

  // Auto-hide revealed secret after 30s
  useEffect(() => {
    if (!revealed) return;
    setCountdown(30);
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((revealed.expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        setRevealed(null);
        clearInterval(interval);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [revealed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => filter === "all" || r.status === filter)
      .filter((r) =>
        !q ||
        r.label.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.username ?? "").toLowerCase().includes(q) ||
        (r.url ?? "").toLowerCase().includes(q),
      );
  }, [rows, search, filter]);

  const resetForm = () =>
    setForm({ label: "", category: "general", username: "", url: "", notes: "", secret: "" });

  const handleCreate = async () => {
    if (!form.label.trim() || !form.secret.trim()) {
      toast.error("Label and secret are required");
      return;
    }
    setWorking(true);
    const { error } = await supabase.rpc("create_credential" as any, {
      _label: form.label.trim(),
      _category: form.category,
      _username: form.username.trim() || null,
      _url: form.url.trim() || null,
      _notes: form.notes.trim() || null,
      _secret: form.secret,
    });
    setWorking(false);
    if (error) {
      toast.error("Could not save credential", { description: error.message });
      return;
    }
    toast.success("Credential saved");
    setShowCreate(false);
    resetForm();
    void loadRows();
  };

  const handleEdit = async () => {
    if (!editing) return;
    setWorking(true);
    const { error } = await supabase.rpc("update_credential_metadata" as any, {
      _id: editing.id,
      _label: form.label.trim(),
      _category: form.category,
      _username: form.username.trim() || null,
      _url: form.url.trim() || null,
      _notes: form.notes.trim() || null,
    });
    setWorking(false);
    if (error) {
      toast.error("Could not update", { description: error.message });
      return;
    }
    toast.success("Updated");
    setEditing(null);
    resetForm();
    void loadRows();
  };

  const handleRotate = async () => {
    if (!showRotate || !form.secret.trim()) {
      toast.error("New secret is required");
      return;
    }
    setWorking(true);
    const { error } = await supabase.rpc("rotate_credential_secret" as any, {
      _id: showRotate.id,
      _new_secret: form.secret,
    });
    setWorking(false);
    if (error) {
      toast.error("Could not rotate", { description: error.message });
      return;
    }
    toast.success("Secret rotated");
    setShowRotate(null);
    resetForm();
    void loadRows();
  };

  const handleRevoke = async (row: VaultRow) => {
    const ok = await confirm({
      title: `Revoke "${row.label}"?`,
      description: "This marks the credential as revoked. It will remain stored for audit purposes but flagged as inactive.",
      confirmText: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("revoke_credential" as any, { _id: row.id });
    if (error) {
      toast.error("Could not revoke", { description: error.message });
      return;
    }
    toast.success("Credential revoked");
    void loadRows();
  };

  const handleReveal = async () => {
    if (!reauthFor || !user?.email || !reauthPassword) return;
    setRevealing(true);
    // Re-authenticate the admin
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: reauthPassword,
    });
    if (authError) {
      setRevealing(false);
      toast.error("Re-authentication failed", { description: authError.message });
      return;
    }
    // Decrypt
    const { data, error } = await supabase.rpc("reveal_credential" as any, { _id: reauthFor.id });
    setRevealing(false);
    if (error) {
      toast.error("Could not reveal", { description: error.message });
      return;
    }
    setRevealed({ row: reauthFor, secret: String(data), expiresAt: Date.now() + 30_000 });
    setReauthFor(null);
    setReauthPassword("");
    setCopied(false);
  };

  const handleCopyRevealed = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const openAudit = async (row: VaultRow) => {
    setShowAudit(row);
    const { data, error } = await supabase
      .from("credential_audit_log" as any)
      .select("id,credential_id,action,actor_email,created_at")
      .eq("credential_id", row.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error("Could not load audit log", { description: error.message });
      setAuditRows([]);
    } else {
      setAuditRows((data as any) ?? []);
    }
  };

  if (loading) return <LoadingState label="Loading vault…" />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground flex items-center gap-2">
            <Lock className="w-6 h-6 text-muted-foreground" />
            Credentials Vault
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Admin-only secure storage for logins, API keys, and service credentials.
            Secrets are encrypted at rest and never displayed unless explicitly revealed.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Credential
        </Button>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-4 flex items-start gap-3 text-sm">
          <ShieldCheck className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-muted-foreground">
            <strong className="text-foreground">Internal use only.</strong> All actions
            (create, edit, rotate, reveal, revoke) are logged with the admin's identity
            and timestamp. Secrets are encrypted at rest using a server-managed key and
            are never exposed to the browser unless you click "Reveal".
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by label, category, username, URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(["active", "revoked", "all"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Secret</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last rotated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No credentials found.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.label}</div>
                    {row.url && (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-0.5"
                      >
                        {row.url.replace(/^https?:\/\//, "").slice(0, 40)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{row.category}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{row.username || "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.secret_preview || "••••••••"}
                  </TableCell>
                  <TableCell>
                    {row.status === "active" ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Revoked</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.rotated_at ? formatDate(row.rotated_at) : formatDate(row.created_at)}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReauthFor(row)}
                      disabled={row.status === "revoked"}
                      className="gap-1"
                    >
                      <Eye className="w-3 h-3" /> Reveal
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          label: row.label,
                          category: row.category,
                          username: row.username ?? "",
                          url: row.url ?? "",
                          notes: row.notes ?? "",
                          secret: "",
                        });
                        setEditing(row);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setForm((f) => ({ ...f, secret: "" }));
                        setShowRotate(row);
                      }}
                      disabled={row.status === "revoked"}
                      className="gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Rotate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openAudit(row)}
                      className="gap-1"
                    >
                      <History className="w-3 h-3" />
                    </Button>
                    {row.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevoke(row)}
                        className="gap-1 text-destructive hover:text-destructive"
                      >
                        <Ban className="w-3 h-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) { setShowCreate(false); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add credential</DialogTitle>
            <DialogDescription>
              The secret is encrypted before being stored. It cannot be viewed again
              without an explicit reveal action.
            </DialogDescription>
          </DialogHeader>
          <CredentialForm form={form} setForm={setForm} includeSecret />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={working}>
              {working ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (no secret) */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) { setEditing(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit credential</DialogTitle>
            <DialogDescription>
              Update label, category, username, URL, or notes. Use "Rotate" to change the secret.
            </DialogDescription>
          </DialogHeader>
          <CredentialForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleEdit} disabled={working}>
              {working ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate dialog */}
      <Dialog open={showRotate !== null} onOpenChange={(o) => { if (!o) { setShowRotate(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate secret for "{showRotate?.label}"</DialogTitle>
            <DialogDescription>
              Enter the new secret value. The previous secret will be replaced and cannot be recovered.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New secret</Label>
            <Textarea
              value={form.secret}
              onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              rows={3}
              placeholder="Paste new secret value"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRotate(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleRotate} disabled={working}>
              {working ? "Rotating…" : "Rotate secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-auth before reveal */}
      <Dialog open={reauthFor !== null} onOpenChange={(o) => { if (!o) { setReauthFor(null); setReauthPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm your password</DialogTitle>
            <DialogDescription>
              Re-enter your admin password to reveal "{reauthFor?.label}".
              This action will be logged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void handleReveal(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReauthFor(null); setReauthPassword(""); }}>
              Cancel
            </Button>
            <Button onClick={handleReveal} disabled={revealing || !reauthPassword}>
              {revealing ? "Verifying…" : "Reveal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal display */}
      <Dialog open={revealed !== null} onOpenChange={(o) => { if (!o) setRevealed(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revealed?.row.label}</DialogTitle>
            <DialogDescription>
              Auto-hides in {countdown}s. Copy the secret now if you need it.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/50 p-3 font-mono text-xs break-all select-all">
            {revealed?.secret}
          </div>
          <Button onClick={handleCopyRevealed} variant="outline" className="w-full gap-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied" : "Copy to clipboard"}
          </Button>
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>Hide now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit log */}
      <Dialog open={showAudit !== null} onOpenChange={(o) => { if (!o) { setShowAudit(null); setAuditRows([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit log — {showAudit?.label}</DialogTitle>
            <DialogDescription>Last 100 actions for this credential.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      No log entries.
                    </TableCell>
                  </TableRow>
                )}
                {auditRows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{formatDate(a.created_at)}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{a.action}</Badge></TableCell>
                    <TableCell className="text-xs">{a.actor_email ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CredentialForm({
  form,
  setForm,
  includeSecret = false,
}: {
  form: { label: string; category: string; username: string; url: string; notes: string; secret: string };
  setForm: React.Dispatch<React.SetStateAction<{ label: string; category: string; username: string; url: string; notes: string; secret: string }>>;
  includeSecret?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Label *</Label>
          <Input
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Amazon Associates — main account"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Username / Email</Label>
          <Input
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            placeholder="admin@example.com"
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>URL</Label>
          <Input
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://service.example.com/login"
          />
        </div>
        {includeSecret && (
          <div className="space-y-1.5 col-span-2">
            <Label>Secret *</Label>
            <Textarea
              value={form.secret}
              onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              rows={3}
              placeholder="Password, API key, token, or any secret value"
            />
            <p className="text-xs text-muted-foreground">
              Stored encrypted. Cannot be displayed again without explicit reveal.
            </p>
          </div>
        )}
        <div className="space-y-1.5 col-span-2">
          <Label>Notes</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            placeholder="Recovery info, MFA notes, owner, etc."
          />
        </div>
      </div>
    </div>
  );
}
