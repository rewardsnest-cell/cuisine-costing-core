import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, RotateCw, Trash2, AlertTriangle, Plus, X } from "lucide-react";
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

  const update = (id: string, patch: Partial<BulkReviewItem>) => {
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const remove = (id: string) => {
    setItems(items.filter((it) => it.id !== id));
  };

  const retry = async (item: BulkReviewItem) => {
    setBusyId(item.id);
    try {
      const res = await generate({
        data: { businessName: item.business_name, city: item.city, type: item.type },
      });
      if (!res.ok) {
        update(item.id, { error: res.error });
        toast.error(res.error);
        return;
      }
      const c = res.contact;
      update(item.id, {
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
      });
    } catch (e: any) {
      update(item.id, { error: e?.message ?? "Failed" });
      toast.error(e?.message ?? "Failed to regenerate");
    } finally {
      setBusyId(null);
    }
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
            {items.map((item) => {
              const busy = busyId === item.id || savingAll;
              return (
                <div key={item.id} className="rounded-md border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
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
                      <Label className="text-xs">Contact name</Label>
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
                      <Label className="text-xs">Website (saved to notes)</Label>
                      <Input value={item.website} onChange={(e) => update(item.id, { website: e.target.value })} />
                    </div>
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
