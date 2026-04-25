import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Save, RotateCw, Trash2, AlertTriangle, Plus, X, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { generateProspectContact } from "@/lib/sales-hub/generate-prospect-contact.functions";
import { supabase } from "@/integrations/supabase/client";

export type BulkReviewContact = { name: string; role: string; email: string; phone: string };

export type BulkReviewItem = {
  id: string;
  business_name: string;
  city: string | null;
  type: string | null;
  // Originals (to preserve on save)
  original_contact_name: string | null;
  original_email: string | null;
  original_phone: string | null;
  original_address: string | null;
  original_website: string | null;
  original_notes: string | null;
  // Editable fields (prefilled from AI suggestion)
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  contacts: BulkReviewContact[];
  ai_notes: string;
  confidence: "high" | "medium" | "low" | "none" | null;
  error?: string | null;
};

export interface BulkContactReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BulkReviewItem[];
  setItems: (items: BulkReviewItem[]) => void;
  onSavedAll?: () => void;
}

export function BulkContactReviewDialog({
  open, onOpenChange, items, setItems, onSavedAll,
}: BulkContactReviewDialogProps) {
  const generate = useServerFn(generateProspectContact);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [regenAll, setRegenAll] = useState(false);
  const [regenProgress, setRegenProgress] = useState<{ done: number; total: number } | null>(null);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const update = (id: string, patch: Partial<BulkReviewItem>) => {
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const remove = (id: string) => {
    setItems(items.filter((it) => it.id !== id));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const applyGenerated = (item: BulkReviewItem, res: Awaited<ReturnType<typeof generate>>): BulkReviewItem => {
    if (!res.ok) return { ...item, error: res.error };
    const c = res.contact;
    return {
      ...item,
      contact_name: c.contact_name ?? item.contact_name,
      email: c.email ?? item.email,
      phone: c.phone ?? item.phone,
      website: c.website ?? item.website,
      address: c.address ?? item.address,
      contacts: (c.contacts && c.contacts.length > 0)
        ? c.contacts.map((x) => ({
            name: x.name ?? "", role: x.role ?? "", email: x.email ?? "", phone: x.phone ?? "",
          }))
        : item.contacts,
      ai_notes: c.notes ?? "",
      confidence: (c.confidence ?? null) as BulkReviewItem["confidence"],
      error: null,
    };
  };

  const retry = async (item: BulkReviewItem) => {
    setBusyId(item.id);
    try {
      const res = await generate({
        data: { businessName: item.business_name, city: item.city, type: item.type },
      });
      if (!res.ok) toast.error(res.error);
      setItems(items.map((it) => (it.id === item.id ? applyGenerated(it, res) : it)));
    } catch (e: any) {
      update(item.id, { error: e?.message ?? "Failed" });
      toast.error(e?.message ?? "Failed to regenerate");
    } finally {
      setBusyId(null);
    }
  };

  const regenerateSelected = async () => {
    const targets = items.filter((it) => selectedIds.has(it.id));
    if (targets.length === 0) {
      toast.error("Select at least one prospect to regenerate.");
      return;
    }
    setRegenAll(true);
    setRegenProgress({ done: 0, total: targets.length });
    let working: BulkReviewItem[] = [...items];
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        const res = await generate({
          data: { businessName: t.business_name, city: t.city, type: t.type },
        });
        if (!res.ok) failed++;
        working = working.map((it) => (it.id === t.id ? applyGenerated(it, res) : it));
        setItems(working);
      } catch (e: any) {
        failed++;
        working = working.map((it) => (it.id === t.id ? { ...it, error: e?.message ?? "Failed" } : it));
        setItems(working);
      }
      setRegenProgress({ done: i + 1, total: targets.length });
      // small delay to be nice to AI gateway / firecrawl rate limits
      await new Promise((r) => setTimeout(r, 500));
    }
    setRegenAll(false);
    setRegenProgress(null);
    if (failed === 0) toast.success(`Regenerated ${targets.length} prospect${targets.length === 1 ? "" : "s"}`);
    else toast.warning(`Regenerated ${targets.length - failed} of ${targets.length}; ${failed} failed`);
  };


  const saveOne = async (item: BulkReviewItem): Promise<boolean> => {
    const cleanContacts = item.contacts.filter((c) => c.name || c.email || c.phone || c.role);
    const contactsBlock = cleanContacts.length > 0
      ? `Contacts:\n${cleanContacts.map((c) => `• ${[c.name, c.role].filter(Boolean).join(" — ") || "Contact"}${c.email ? ` <${c.email}>` : ""}${c.phone ? ` · ${c.phone}` : ""}`).join("\n")}`
      : null;
    const aiNote = item.ai_notes
      ? `AI contact research (${item.confidence ?? "?"} confidence): ${item.ai_notes}`
      : null;
    const mergedNotes = [item.original_notes?.trim(), aiNote, contactsBlock].filter(Boolean).join("\n\n") || null;
    const { error } = await (supabase as any)
      .from("sales_prospects")
      .update({
        contact_name: (item.contact_name || item.original_contact_name || "").trim() || null,
        email: (item.email || item.original_email || "").trim() || null,
        phone: (item.phone || item.original_phone || "").trim() || null,
        website: (item.website || item.original_website || "").trim() || null,
        address: (item.address || item.original_address || "").trim() || null,
        notes: mergedNotes,
      })
      .eq("id", item.id);
    if (error) {
      update(item.id, { error: error.message });
      return false;
    }
    return true;
  };

  const saveAndRemove = async (item: BulkReviewItem) => {
    setBusyId(item.id);
    const ok = await saveOne(item);
    setBusyId(null);
    if (ok) {
      toast.success(`Saved ${item.business_name}`);
      const remaining = items.filter((it) => it.id !== item.id);
      setItems(remaining);
      if (remaining.length === 0) {
        onOpenChange(false);
        onSavedAll?.();
      }
    } else {
      toast.error("Save failed");
    }
  };

  const saveAll = async () => {
    setSavingAll(true);
    let saved = 0;
    let failed = 0;
    const remaining: BulkReviewItem[] = [];
    for (const item of items) {
      const ok = await saveOne(item);
      if (ok) saved++; else { failed++; remaining.push({ ...item }); }
    }
    setSavingAll(false);
    setItems(remaining);
    if (saved) toast.success(`Saved ${saved} prospect${saved === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}`);
    if (failed === 0) {
      onOpenChange(false);
      onSavedAll?.();
    }
  };

  const confColor = (c: BulkReviewItem["confidence"]) =>
    c === "high" ? "default" : c === "medium" ? "secondary" : "outline";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review generated contact info</DialogTitle>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nothing to review.
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Review each AI suggestion. Edit fields, regenerate, skip, or save individually.
              Existing values on a prospect are preserved if you leave a field blank.
            </p>

            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => {
                    if (v) setSelectedIds(new Set(items.map((it) => it.id)));
                    else setSelectedIds(new Set());
                  }}
                  disabled={regenAll || savingAll}
                  aria-label="Select all for regenerate"
                />
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : `Select all (${items.length})`}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {regenProgress && (
                  <span className="text-xs text-muted-foreground">
                    {regenProgress.done} / {regenProgress.total}
                  </span>
                )}
                <Button
                  size="sm" variant="secondary" className="gap-1.5"
                  disabled={regenAll || savingAll || selectedIds.size === 0}
                  onClick={regenerateSelected}
                >
                  {regenAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {regenAll ? "Regenerating…" : `Regenerate selected (${selectedIds.size})`}
                </Button>
              </div>
            </div>

            {items.map((item) => {
              const busy = busyId === item.id || savingAll || regenAll;
              return (
                <div key={item.id} className="rounded-md border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        className="mt-1"
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={(v) => toggleSelect(item.id, !!v)}
                        disabled={regenAll || savingAll}
                        aria-label={`Select ${item.business_name}`}
                      />
                      <div>
                        <div className="font-medium text-sm">{item.business_name}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.type && <Badge variant="outline" className="text-[10px]">{item.type}</Badge>}
                          {item.city && <Badge variant="outline" className="text-[10px]">{item.city}</Badge>}
                          {item.confidence && (
                            <Badge variant={confColor(item.confidence) as any} className="text-[10px]">
                              {item.confidence} confidence
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => retry(item)} disabled={busy} title="Regenerate">
                        {busy && busyId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(item.id)} disabled={busy} title="Skip / remove">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {item.error && (
                    <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded p-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{item.error}</span>
                    </div>
                  )}

                  {item.ai_notes && (
                    <p className="text-xs text-muted-foreground italic">{item.ai_notes}</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Primary contact name</Label>
                      <Input value={item.contact_name} onChange={(e) => update(item.id, { contact_name: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={item.email} onChange={(e) => update(item.id, { email: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input value={item.phone} onChange={(e) => update(item.id, { phone: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Website</Label>
                      <Input value={item.website} onChange={(e) => update(item.id, { website: e.target.value })} />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Address</Label>
                      <Input value={item.address} onChange={(e) => update(item.id, { address: e.target.value })} placeholder="123 Main St, City, ST 12345" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Additional contacts (saved to notes)</Label>
                      <Button
                        type="button" size="sm" variant="ghost" className="h-7 gap-1"
                        onClick={() => update(item.id, { contacts: [...item.contacts, { name: "", role: "", email: "", phone: "" }] })}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </Button>
                    </div>
                    {item.contacts.map((c, idx) => (
                      <div key={idx} className="rounded-md border p-2 relative">
                        <button
                          type="button"
                          onClick={() => update(item.id, { contacts: item.contacts.filter((_, i) => i !== idx) })}
                          className="absolute top-1 right-1 text-muted-foreground hover:text-destructive"
                          aria-label="Remove contact"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Name" value={c.name}
                            onChange={(e) => { const next = [...item.contacts]; next[idx] = { ...c, name: e.target.value }; update(item.id, { contacts: next }); }} />
                          <Input placeholder="Role" value={c.role}
                            onChange={(e) => { const next = [...item.contacts]; next[idx] = { ...c, role: e.target.value }; update(item.id, { contacts: next }); }} />
                          <Input placeholder="Email" value={c.email}
                            onChange={(e) => { const next = [...item.contacts]; next[idx] = { ...c, email: e.target.value }; update(item.id, { contacts: next }); }} />
                          <Input placeholder="Phone" value={c.phone}
                            onChange={(e) => { const next = [...item.contacts]; next[idx] = { ...c, phone: e.target.value }; update(item.id, { contacts: next }); }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => saveAndRemove(item)} disabled={busy} className="gap-1.5">
                      {busy && busyId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={savingAll}>Close</Button>
          <Button onClick={saveAll} disabled={savingAll || items.length === 0} className="gap-1.5">
            {savingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save all ({items.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
