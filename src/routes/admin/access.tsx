import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Mail, RotateCw, Trash2, UserPlus, Search, ShieldCheck, History } from "lucide-react";
import { SECTION_KEYS, SECTION_LABELS, ROLE_KEYS, type SectionKey, type RoleKey } from "@/lib/access/sections";
import {
  inviteEmployee,
  resendInvite,
  revokeInvite,
  setUserRole,
  setRolePermission,
  setUserOverride,
} from "@/lib/admin/access-control.functions";

export const Route = createFileRoute("/admin/access")({
  head: () => ({ meta: [{ title: "Access Control — VPS Finest Admin" }] }),
  component: AccessControlPage,
});

type Profile = { user_id: string; full_name: string | null; email: string | null };
type RoleRow = { user_id: string; role: string };
type Invite = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
};

function AccessControlPage() {
  const [permMatrix, setPermMatrix] = useState<Record<string, boolean>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const inviteFn = useServerFn(inviteEmployee);
  const resendFn = useServerFn(resendInvite);
  const revokeFn = useServerFn(revokeInvite);
  const roleFn = useServerFn(setUserRole);
  const permFn = useServerFn(setRolePermission);
  const overrideFn = useServerFn(setUserOverride);

  const loadAll = async () => {
    const [perms, profs, rls, invs, log] = await Promise.all([
      (supabase as any).from("role_section_permissions").select("role, section, enabled"),
      (supabase as any).from("profiles").select("user_id, full_name, email").order("full_name"),
      (supabase as any).from("user_roles").select("user_id, role"),
      (supabase as any)
        .from("employee_invites")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      (supabase as any)
        .from("access_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    const m: Record<string, boolean> = {};
    for (const r of perms.data ?? []) m[`${r.role}:${r.section}`] = !!r.enabled;
    setPermMatrix(m);
    setProfiles(profs.data ?? []);
    setRoles(rls.data ?? []);
    setInvites(invs.data ?? []);
    setAudit(log.data ?? []);
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setOverrides({});
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("user_section_overrides")
        .select("section, enabled")
        .eq("user_id", selectedUserId);
      const m: Record<string, boolean> = {};
      for (const o of data ?? []) m[o.section] = !!o.enabled;
      setOverrides(m);
    })();
  }, [selectedUserId]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles.slice(0, 20);
    return profiles
      .filter(
        (p) =>
          (p.full_name ?? "").toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [profiles, search]);

  const userRoles = (uid: string) =>
    roles.filter((r) => r.user_id === uid).map((r) => r.role);

  const togglePerm = async (role: RoleKey, section: SectionKey, enabled: boolean) => {
    if (role === "admin") return; // admin always full
    const key = `${role}:${section}`;
    setPermMatrix((m) => ({ ...m, [key]: enabled }));
    try {
      await permFn({ data: { role, section, enabled } });
      toast.success("Permission updated");
    } catch (e: any) {
      toast.error(e.message || "Failed");
      setPermMatrix((m) => ({ ...m, [key]: !enabled }));
    }
  };

  const toggleRole = async (userId: string, role: "user" | "employee" | "admin", add: boolean) => {
    try {
      await roleFn({ data: { userId, role, add } });
      toast.success(add ? `Granted ${role}` : `Removed ${role}`);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const setOverride = async (section: SectionKey, value: "inherit" | "allow" | "deny") => {
    if (!selectedUserId) return;
    const enabled = value === "inherit" ? null : value === "allow";
    try {
      await overrideFn({ data: { userId: selectedUserId, section, enabled } });
      setOverrides((o) => {
        const n = { ...o };
        if (enabled === null) delete n[section];
        else n[section] = enabled;
        return n;
      });
      toast.success("Override updated");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" /> Access Control
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage what each role sees, assign roles to users, and invite employees.
        </p>
      </div>

      {/* Role permission matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role Permissions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Section</th>
                {ROLE_KEYS.map((r) => (
                  <th key={r} className="text-center p-2 capitalize">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTION_KEYS.map((section) => (
                <tr key={section} className="border-b last:border-b-0">
                  <td className="p-2 font-medium">{SECTION_LABELS[section]}</td>
                  {ROLE_KEYS.map((role) => {
                    const checked = role === "admin" ? true : !!permMatrix[`${role}:${section}`];
                    return (
                      <td key={role} className="p-2 text-center">
                        <Switch
                          checked={checked}
                          disabled={role === "admin"}
                          onCheckedChange={(v) => togglePerm(role, section, v)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-3">
            Admin role always sees every section.
          </p>
        </CardContent>
      </Card>

      {/* Invite employee */}
      <InviteForm onInvited={loadAll} inviteFn={inviteFn} />

      {/* Pending invites */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Invites</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invites yet.</p>
          ) : (
            invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between border border-border/60 rounded-lg p-3 gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {inv.full_name || inv.email}{" "}
                    <Badge variant="outline" className="ml-1 text-xs capitalize">
                      {inv.role}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {inv.email} · {new Date(inv.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={inv.status} />
                  {inv.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await resendFn({ data: { inviteId: inv.id } });
                            toast.success("Invite resent");
                            loadAll();
                          } catch (e: any) {
                            toast.error(e.message || "Failed");
                          }
                        }}
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (!confirm(`Revoke invite for ${inv.email}?`)) return;
                          try {
                            await revokeFn({ data: { inviteId: inv.id } });
                            toast.success("Invite revoked");
                            loadAll();
                          } catch (e: any) {
                            toast.error(e.message || "Failed");
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Assign roles + per-user overrides */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users — Roles & Overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {filteredUsers.map((p) => {
                const ur = userRoles(p.user_id);
                const selected = selectedUserId === p.user_id;
                return (
                  <div
                    key={p.user_id}
                    className={`border rounded-lg p-3 cursor-pointer ${
                      selected ? "border-primary bg-primary/5" : "border-border/60"
                    }`}
                    onClick={() => setSelectedUserId(p.user_id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {p.full_name || "(no name)"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0">
                        {ur.length === 0 ? (
                          <Badge variant="outline" className="text-xs">
                            user
                          </Badge>
                        ) : (
                          ur.map((r) => (
                            <Badge
                              key={r}
                              className="text-xs capitalize"
                              variant={r === "admin" ? "default" : "secondary"}
                            >
                              {r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                    {selected && (
                      <div
                        className="flex flex-wrap gap-2 mt-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(["employee", "admin"] as const).map((r) => {
                          const has = ur.includes(r);
                          return (
                            <Button
                              key={r}
                              size="sm"
                              variant={has ? "default" : "outline"}
                              onClick={() => toggleRole(p.user_id, r, !has)}
                            >
                              {has ? `Remove ${r}` : `Make ${r}`}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredUsers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No users match your search.
                </p>
              )}
            </div>

            <div>
              {!selectedUserId ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  Select a user to manage per-section overrides.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                    Per-section overrides
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Inherit = uses the role default. Allow/Deny overrides it for this user only.
                  </p>
                  {SECTION_KEYS.map((section) => {
                    const has = section in overrides;
                    const value = !has ? "inherit" : overrides[section] ? "allow" : "deny";
                    return (
                      <div
                        key={section}
                        className="flex items-center justify-between gap-3 border border-border/60 rounded-lg p-2.5"
                      >
                        <span className="text-sm">{SECTION_LABELS[section]}</span>
                        <Select
                          value={value}
                          onValueChange={(v) =>
                            setOverride(section, v as "inherit" | "allow" | "deny")
                          }
                        >
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inherit">Inherit</SelectItem>
                            <SelectItem value="allow">Allow</SelectItem>
                            <SelectItem value="deny">Deny</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No actions logged yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {audit.map((a) => (
                <div key={a.id} className="text-xs flex items-center gap-2 p-2 rounded border border-border/40">
                  <span className="font-mono text-muted-foreground shrink-0">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {a.action.replaceAll("_", " ")}
                  </Badge>
                  <span className="truncate">
                    {a.actor_email || "system"}
                    {a.target_email ? ` → ${a.target_email}` : ""}
                    {a.details && Object.keys(a.details).length > 0
                      ? ` · ${JSON.stringify(a.details)}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-700",
    accepted: "bg-emerald-500/15 text-emerald-700",
    revoked: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${map[status] || "bg-muted"}`}>
      {status}
    </span>
  );
}

function InviteForm({
  onInvited,
  inviteFn,
}: {
  onInvited: () => void;
  inviteFn: ReturnType<typeof useServerFn<typeof inviteEmployee>>;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await inviteFn({ data: { email, fullName, role } });
      toast.success(`Invite sent to ${email}`);
      setEmail("");
      setFullName("");
      onInvited();
    } catch (err: any) {
      toast.error(err.message || "Failed to invite");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Invite Employee
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-1">
            <Label className="text-xs">Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={255}
            />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "employee" | "admin")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <Button type="submit" disabled={submitting} className="bg-gradient-warm text-primary-foreground gap-2">
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              Send Invite
            </Button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground mt-3">
          The invitee will receive an email with a secure link to set their password and sign in.
        </p>
      </CardContent>
    </Card>
  );
}
