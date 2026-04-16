import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Shield, UserPlus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  component: UserManagementPage,
});

type Profile = {
  user_id: string;
  full_name: string | null;
  created_at: string;
};

type UserRole = {
  user_id: string;
  role: string;
};

function UserManagementPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [{ data: profilesData }, { data: rolesData }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setProfiles(profilesData || []);
    setRoles(rolesData || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const getUserRoles = (userId: string) => roles.filter((r) => r.user_id === userId);

  const grantAdmin = async (userId: string) => {
    await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    fetchData();
  };

  const revokeAdmin = async (userId: string) => {
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    fetchData();
  };

  if (loading) return <p className="text-muted-foreground">Loading users...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">User Management</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage user accounts and admin access.</p>
      </div>

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
      </div>

      <div className="space-y-3">
        {profiles.map((profile) => {
          const userRoles = getUserRoles(profile.user_id);
          const hasAdmin = userRoles.some((r) => r.role === "admin");
          return (
            <Card key={profile.user_id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{profile.full_name || "Unnamed User"}</p>
                  <p className="text-xs text-muted-foreground">Joined {new Date(profile.created_at).toLocaleDateString()}</p>
                  <div className="flex gap-1 mt-1">
                    {userRoles.map((r) => (
                      <Badge key={r.role} variant={r.role === "admin" ? "default" : "secondary"} className="text-xs">{r.role}</Badge>
                    ))}
                    {userRoles.length === 0 && <Badge variant="outline" className="text-xs">customer</Badge>}
                  </div>
                </div>
                <div>
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
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
