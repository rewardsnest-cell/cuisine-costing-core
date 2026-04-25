import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, Loader2, Save, UserSearch, AlertTriangle, Plus, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  generateProspectContact,
  type GeneratedProspectContact,
} from "@/lib/sales-hub/generate-prospect-contact.functions";
import { supabase } from "@/integrations/supabase/client";

export interface GenerateContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: {
    id: string;
    business_name: string;
    city: string | null;
    type: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address?: string | null;
    website?: string | null;
    notes: string | null;
  } | null;
  onSaved?: () => void;
}

export function GenerateContactDialog({
  open, onOpenChange, prospect, onSaved,
}: GenerateContactDialogProps) {
  const generate = useServerFn(generateProspectContact);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<GeneratedProspectContact | null>(null);

  // Editable fields
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [extraContacts, setExtraContacts] = useState<
    Array<{ name: string; role: string; email: string; phone: string }>
  >([]);
  const [aiNotes, setAiNotes] = useState("");

  useEffect(() => {
    if (!open || !prospect) return;
    setResult(null);
    setContactName(prospect.contact_name ?? "");
    setEmail(prospect.email ?? "");
    setPhone(prospect.phone ?? "");
    setWebsite(prospect.website ?? "");
    setAddress(prospect.address ?? "");
    setExtraContacts([]);
    setAiNotes("");
  }, [open, prospect]);

  const runGenerate = async () => {
    if (!prospect) return;
    setLoading(true);
    try {
      const res = await generate({
        data: {
          businessName: prospect.business_name,
          city: prospect.city,
          type: prospect.type,
        },
      });
      if (!res.ok) { toast.error(res.error); return; }
      setResult(res.contact);
      // Only fill empty fields — don't clobber what the user already had
      if (!contactName && res.contact.contact_name) setContactName(res.contact.contact_name);
      if (!email && res.contact.email) setEmail(res.contact.email);
      if (!phone && res.contact.phone) setPhone(res.contact.phone);
      if (!website && res.contact.website) setWebsite(res.contact.website);
      if (!address && res.contact.address) setAddress(res.contact.address);
      if (Array.isArray(res.contact.contacts) && res.contact.contacts.length > 0) {
        setExtraContacts(
          res.contact.contacts.map((c) => ({
            name: c.name ?? "",
            role: c.role ?? "",
            email: c.email ?? "",
            phone: c.phone ?? "",
          })),
        );
      }
      if (res.contact.notes) setAiNotes(res.contact.notes);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate contact info");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!prospect) return;
    setSaving(true);
    try {
      const cleanContacts = extraContacts.filter((c) => c.name || c.email || c.phone || c.role);
      const contactsBlock = cleanContacts.length > 0
        ? `Contacts:\n${cleanContacts.map((c) => `• ${[c.name, c.role].filter(Boolean).join(" — ") || "Contact"}${c.email ? ` <${c.email}>` : ""}${c.phone ? ` · ${c.phone}` : ""}`).join("\n")}`
        : null;
      const aiBlock = aiNotes
        ? `AI contact research (${result?.confidence ?? "?"} confidence): ${aiNotes}`
        : null;
      const trimmedNotes = [
        prospect.notes?.trim(),
        aiBlock,
        contactsBlock,
      ].filter(Boolean).join("\n\n");

      const { error } = await (supabase as any)
        .from("sales_prospects")
        .update({
          contact_name: contactName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          website: website.trim() || null,
          address: address.trim() || null,
          notes: trimmedNotes || null,
        })
        .eq("id", prospect.id);
      if (error) throw error;
      toast.success("Contact info saved");
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const confColor =
    result?.confidence === "high" ? "default"
    : result?.confidence === "medium" ? "secondary"
    : "outline";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserSearch className="w-4 h-4" />
            Generate contact info — {prospect?.business_name}
          </DialogTitle>
        </DialogHeader>

        {prospect && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{prospect.type ?? "—"}</Badge>
              {prospect.city && <Badge variant="outline">{prospect.city}</Badge>}
            </div>

            {!result && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                Click <span className="font-medium text-foreground">Generate</span> to research likely public contact details for this prospect. Always verify before sending outreach.
              </div>
            )}

            {result && (
              <div className="rounded-md border p-3 text-sm flex items-start gap-2 bg-muted/30">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">AI suggestion</span>
                    <Badge variant={confColor as any} className="text-[10px]">
                      {result.confidence ?? "unknown"} confidence
                    </Badge>
                  </div>
                  {aiNotes && <p className="text-xs text-muted-foreground">{aiNotes}</p>}
                  <p className="text-xs text-muted-foreground italic">
                    Review and edit below before saving.
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Primary contact name</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="events@business.com" />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, ST 12345" />
              </div>
              <div>
                <Label className="text-xs">Website</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://business.com" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Additional contacts (saved to notes)</Label>
                  <Button
                    type="button" size="sm" variant="ghost" className="h-7 gap-1"
                    onClick={() => setExtraContacts([...extraContacts, { name: "", role: "", email: "", phone: "" }])}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
                {extraContacts.length === 0 && (
                  <p className="text-xs text-muted-foreground">None yet. AI may suggest specific people when you generate.</p>
                )}
                {extraContacts.map((c, idx) => (
                  <div key={idx} className="rounded-md border p-2 space-y-2 relative">
                    <button
                      type="button"
                      onClick={() => setExtraContacts(extraContacts.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 text-muted-foreground hover:text-destructive"
                      aria-label="Remove contact"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Name"
                        value={c.name}
                        onChange={(e) => {
                          const next = [...extraContacts]; next[idx] = { ...c, name: e.target.value };
                          setExtraContacts(next);
                        }}
                      />
                      <Input
                        placeholder="Role (e.g. Events Manager)"
                        value={c.role}
                        onChange={(e) => {
                          const next = [...extraContacts]; next[idx] = { ...c, role: e.target.value };
                          setExtraContacts(next);
                        }}
                      />
                      <Input
                        placeholder="Email"
                        value={c.email}
                        onChange={(e) => {
                          const next = [...extraContacts]; next[idx] = { ...c, email: e.target.value };
                          setExtraContacts(next);
                        }}
                      />
                      <Input
                        placeholder="Phone"
                        value={c.phone}
                        onChange={(e) => {
                          const next = [...extraContacts]; next[idx] = { ...c, phone: e.target.value };
                          setExtraContacts(next);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading || saving}>Cancel</Button>
          <Button variant="outline" onClick={runGenerate} disabled={loading || saving} className="gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "Researching…" : result ? "Regenerate" : "Generate"}
          </Button>
          <Button onClick={save} disabled={saving || loading} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
