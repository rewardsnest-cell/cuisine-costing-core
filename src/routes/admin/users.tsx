import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Shield, UserPlus, Trash2, Clock, Check, X, Search, ChevronDown, ChevronRight, CalendarDays, Compass, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const ALL_ROLES = ["admin", "moderator", "employee", "sales", "social_media", "marketing", "user"] as const;
type AppRole = (typeof ALL_ROLES)[number];
import { useConfirm } from "@/components/ConfirmDialog";
import { CreateTestAdminButton } from "@/components/admin/CreateTestAdminButton";
import { UserNavOverridesPanel } from "@/components/admin/UserNavOverridesPanel";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/users")({
  component: UserManagementPage,
});

type Profile = { user_id: string; full_name: string | null; email: string | null; created_at: string };
type UserRole = { user_id: string; role: string };
type AdminRequest = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  status: string;
  created_at: string;
};

type EventLite = {
  id: string;
  reference_number: string | null;
  event_type: string | null;
  event_date: string | null;
  status: string;
  total: number | null;
};

function UserManagementPage() {
  const { user } = useAuth();
  const askConfirm = useConfirm();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, EventLite[] | "loading" | undefined>>({});
  const [navOpen, setNavOpen] = useState<Record<string, boolean>>({});
  const [rolesOpen, setRolesOpen] = useState<Record<string, boolean>>({});
  const [savingRole, setSavingRole] = useState<string | null>(null);

  const toggleRole = async (userId: string, role: AppRole, currentlyHas: boolean) => {
    const key = `${userId}:${role}`;
    if (role === "admin" && currentlyHas) {
      const ok = await askConfirm({
        title: "Revoke admin access?",
        description: "This user will lose admin privileges immediately.",
        confirmText: "Revoke",
      });
      if (!ok) return;
    }
    setSavingRole(key);
    if (currentlyHas) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error && !error.message.includes("duplicate")) toast.error(error.message);
    }
    await fetchData();
    setSavingRole(null);
  };

  const fetchData = async () => {
    const [{ data: profilesData }, { data: rolesData }, { data: requestsData }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("admin_requests").select("*").order("created_at", { ascending: false }),
    ]);
    setProfiles(profilesData || []);
    setRoles(rolesData || []);
    setRequests(requestsData || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const toggleEvents = async (userId: string) => {
    if (expanded[userId] && expanded[userId] !== "loading") {
      setExpanded((p) => ({ ...p, [userId]: undefined }));
      return;
    }
    setExpanded((p) => ({ ...p, [userId]: "loading" }));
    const { data } = await (supabase as any)
      .from("quotes")
      .select("id, reference_number, event_type, event_date, status, total")
      .eq("user_id", userId)
      .order("event_date", { ascending: false, nullsFirst: false });
    setExpanded((p) => ({ ...p, [userId]: (data ?? []) as EventLite[] }));
  };

  const getUserRoles = (userId: string) => roles.filter((r) => r.user_id === userId);

  const grantAdmin = async (userId: string) => {
    await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    fetchData();
  };

  const revokeAdmin = async (userId: string) => {
    const profile = profiles.find((p) => p.user_id === userId);
    const ok = await askConfirm({
      title: "Revoke admin access?",
      description: profile?.email
        ? `${profile.full_name || profile.email} will lose admin privileges immediately.`
        : "This user will lose admin privileges immediately.",
      confirmText: "Revoke",
    });
    if (!ok) return;
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    fetchData();
  };

  const approveRequest = async (req: AdminRequest) => {
    await supabase.from("user_roles").insert({ user_id: req.user_id, role: "admin" });
    await supabase.from("admin_requests").update({
      status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString(),
    }).eq("id", req.id);
    fetchData();
  };

  const denyRequest = async (req: AdminRequest) => {
    await supabase.from("admin_requests").update({
      status: "denied", reviewed_by: user?.id, reviewed_at: new Date().toISOString(),
    }).eq("id", req.id);
    fetchData();
  };

  if (loading) return <p className="text-muted-foreground">Loading users...</p>;

  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-6">
      <PageHelpCard route="/admin/users" />
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">User Management</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage user accounts, admin requests, and access.</p>
      </div>

      <CreateTestAdminButton />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-primary/10 text-primary"><Users className="w-5 h-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-2xl font-bold font-display">{profiles.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-success/10 text-success"><Shield className="w-5 h-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Admins</p>
              <p className="text-2xl font-bold font-display">{roles.filter((r) => r.role === "admin").length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-warning/10 text-warning"><Clock className="w-5 h-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Pending Requests</p>
              <p className="text-2xl font-bold font-display">{pendingRequests.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {pendingRequests.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-semibold text-foreground">Pending Admin Requests</h3>
          {pendingRequests.map((req) => (
            <Card key={req.id} className="border-warning/40">
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold">{req.full_name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground">{req.email}</p>
                  <p className="text-xs text-muted-foreground">Requested {new Date(req.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approveRequest(req)} className="gap-1 bg-success text-success-foreground hover:bg-success/90">
                    <Check className="w-3 h-3" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => denyRequest(req)} className="gap-1 text-destructive hover:text-destructive">
                    <X className="w-3 h-3" /> Deny
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-display text-lg font-semibold text-foreground">All Users</h3>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {profiles
          .filter((p) => {
            const q = search.trim().toLowerCase();
            if (!q) return true;
            return (p.full_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
          })
          .map((profile) => {
          const userRoles = getUserRoles(profile.user_id);
          const hasAdmin = userRoles.some((r) => r.role === "admin");
          const isOpen = expanded[profile.user_id] !== undefined;
          const events = expanded[profile.user_id];
          return (
            <Card key={profile.user_id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-semibold">{profile.full_name || "Unnamed User"}</p>
                    {profile.email && <p className="text-xs text-muted-foreground">{profile.email}</p>}
                    <p className="text-xs text-muted-foreground">Joined {new Date(profile.created_at).toLocaleDateString()}</p>
                    <div className="flex gap-1 mt-1">
                      {userRoles.map((r) => (
                        <Badge key={r.role} variant={r.role === "admin" ? "default" : "secondary"} className="text-xs">{r.role}</Badge>
                      ))}
                      {userRoles.length === 0 && <Badge variant="outline" className="text-xs">customer</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => toggleEvents(profile.user_id)} className="gap-1">
                      {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <CalendarDays className="w-3 h-3" /> Events
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNavOpen((p) => ({ ...p, [profile.user_id]: !p[profile.user_id] }))}
                      className="gap-1"
                    >
                      {navOpen[profile.user_id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <Compass className="w-3 h-3" /> Navigation
                    </Button>
                    {hasAdmin ? (
                      <Button variant="outline" size="sm" onClick={() => revokeAdmin(profile.user_id)} className="gap-1 text-destructive hover:text-destructive">
                        <Trash2 className="w-3 h-3" /> Revoke Admin
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => grantAdmin(profile.user_id)} className="gap-1">
                        <UserPlus className="w-3 h-3" /> Grant Admin
                      </Button>
                    )}
                  </div>
                </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRolesOpen((p) => ({ ...p, [profile.user_id]: !p[profile.user_id] }))}
                      className="gap-1"
                    >
                      {rolesOpen[profile.user_id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <ShieldCheck className="w-3 h-3" /> Roles
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNavOpen((p) => ({ ...p, [profile.user_id]: !p[profile.user_id] }))}
                      className="gap-1"
                    >
                      {navOpen[profile.user_id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <Compass className="w-3 h-3" /> Navigation
                    </Button>
                    {hasAdmin ? (
                      <Button variant="outline" size="sm" onClick={() => revokeAdmin(profile.user_id)} className="gap-1 text-destructive hover:text-destructive">
                        <Trash2 className="w-3 h-3" /> Revoke Admin
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => grantAdmin(profile.user_id)} className="gap-1">
                        <UserPlus className="w-3 h-3" /> Grant Admin
                      </Button>
                    )}
                  </div>
                </div>
                {rolesOpen[profile.user_id] && (
                  <div className="pl-2 border-l-2 border-primary/40 space-y-2">
                    <p className="text-xs font-semibold text-foreground">Assigned Roles</p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_ROLES.map((role) => {
                        const has = userRoles.some((r) => r.role === role);
                        const saving = savingRole === `${profile.user_id}:${role}`;
                        return (
                          <Button
                            key={role}
                            type="button"
                            variant={has ? "default" : "outline"}
                            size="sm"
                            disabled={saving}
                            onClick={() => toggleRole(profile.user_id, role, has)}
                            className="gap-1 h-7 text-xs"
                          >
                            {has && <Check className="w-3 h-3" />}
                            {role}
                          </Button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">Click a role to grant or revoke it. Changes save immediately.</p>
                  </div>
                )}
                  <div className="pl-2 border-l-2 border-primary/40 space-y-2">
                    <p className="text-xs font-semibold text-foreground">Sidebar Navigation</p>
                    <UserNavOverridesPanel userId={profile.user_id} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
