import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserCog, Plus, Pencil, Search, BadgeCheck, BadgeX } from "lucide-react";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/employees")({
  head: () => ({ meta: [{ title: "Employees — VPS Finest Admin" }] }),
  component: EmployeesPage,
});

type Profile = { user_id: string; full_name: string | null; email: string | null };
type EmployeeProfile = {
  id: string;
  user_id: string;
  position: string | null;
  phone: string | null;
  hourly_rate: number;
  hire_date: string | null;
  active: boolean;
  notes: string | null;
};
type Row = EmployeeProfile & { profile: Profile | null };

const emptyForm = {
  user_id: "",
  position: "",
  phone: "",
  hourly_rate: "0",
  hire_date: "",
  active: true,
  notes: "",
};

function EmployeesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: emps }, { data: profs }] = await Promise.all([
      (supabase as any).from("employee_profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, email"),
    ]);
    const profMap = new Map((profs ?? []).map((p) => [p.user_id, p as Profile]));
    setRows(((emps ?? []) as EmployeeProfile[]).map((e) => ({ ...e, profile: profMap.get(e.user_id) ?? null })));
    setProfiles((profs ?? []) as Profile[]);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      user_id: r.user_id,
      position: r.position ?? "",
      phone: r.phone ?? "",
      hourly_rate: String(r.hourly_rate ?? 0),
      hire_date: r.hire_date ?? "",
      active: r.active,
      notes: r.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.user_id) { toast.error("Pick a user"); return; }
    setSaving(true);
    const payload = {
      user_id: form.user_id,
      position: form.position || null,
      phone: form.phone || null,
      hourly_rate: Number(form.hourly_rate) || 0,
      hire_date: form.hire_date || null,
      active: form.active,
      notes: form.notes || null,
    };
    if (editing) {
      const { error } = await (supabase as any).from("employee_profiles").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { error } = await (supabase as any).from("employee_profiles").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      // Also grant employee role
      const { error: roleErr } = await (supabase as any)
        .from("user_roles")
        .insert({ user_id: form.user_id, role: "employee" });
      if (roleErr && !roleErr.message.includes("duplicate")) {
        toast.warning("Profile saved, but role grant failed: " + roleErr.message);
      }
    }
    toast.success("Employee saved");
    setOpen(false);
    setSaving(false);
    load();
  };

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (r.profile?.full_name || "").toLowerCase().includes(q) ||
      (r.profile?.email || "").toLowerCase().includes(q) ||
      (r.position || "").toLowerCase().includes(q)
    );
  });

  // For the user picker: exclude users who already have an employee profile (when adding new)
  const existingUserIds = new Set(rows.map((r) => r.user_id));
  const pickable = editing
    ? profiles
    : profiles.filter((p) => !existingUserIds.has(p.user_id));

  return (
    <div className="space-y-4">
      <PageHelpCard route="/admin/employees" />
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, email, or position" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add Employee</Button>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <UserCog className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No employees yet. Add one to start assigning events.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold flex items-center gap-2">
                    {r.profile?.full_name || r.profile?.email || "Unknown user"}
                    {r.active
                      ? <span className="inline-flex items-center gap-1 text-xs text-success"><BadgeCheck className="w-3.5 h-3.5" />Active</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><BadgeX className="w-3.5 h-3.5" />Inactive</span>}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {r.position || "—"} · {r.profile?.email || ""} · {r.phone || "no phone"} · ${Number(r.hourly_rate).toFixed(2)}/hr
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openEdit(r)} className="gap-2"><Pencil className="w-3.5 h-3.5" />Edit</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Employee" : "Add Employee"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>User account</Label>
              <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Pick a user" /></SelectTrigger>
                <SelectContent>
                  {pickable.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.full_name || p.email || p.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">User must already have a Lovable account. The "employee" role is granted automatically.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Position</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Lead Cook" /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Hourly rate</Label><Input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} /></div>
              <div><Label>Hire date</Label><Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Active</Label>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
