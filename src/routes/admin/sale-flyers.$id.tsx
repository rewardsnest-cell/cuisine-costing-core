import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  CalendarRange,
  Loader2,
  Sparkles,
  Tag,
  Trash2,
  Save,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { processSaleFlyer } from "@/lib/server-fns/process-sale-flyer.functions";
import { FlippGenerateButton } from "@/components/admin/FlippGenerateButton";

export const Route = createFileRoute("/admin/sale-flyers/$id")({
  component: SaleFlyerDetailPage,
});

type Flyer = {
  id: string;
  supplier_id: string | null;
  title: string | null;
  image_url: string | null;
  sale_start_date: string | null;
  sale_end_date: string | null;
  status: string;
  notes: string | null;
  raw_ocr_text: string | null;
  processed_at: string | null;
  created_at: string;
};

type Page = {
  id: string;
  page_number: number;
  image_url: string;
};

type Item = {
  id: string;
  name: string;
  brand: string | null;
  pack_size: string | null;
  unit: string | null;
  sale_price: number | null;
  regular_price: number | null;
  savings: number | null;
  inventory_item_id: string | null;
};

function SaleFlyerDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [flyer, setFlyer] = useState<Flyer | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [editedItems, setEditedItems] = useState<Item[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);
  const [savingItems, setSavingItems] = useState(false);
  const [supplierName, setSupplierName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<{ title: string; sale_start_date: string; sale_end_date: string }>({
    title: "",
    sale_start_date: "",
    sale_end_date: "",
  });

  const load = async () => {
    setLoading(true);
    const { data: f } = await (supabase as any)
      .from("sale_flyers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    setFlyer((f as Flyer) ?? null);
    if (f) {
      setForm({
        title: f.title ?? "",
        sale_start_date: f.sale_start_date ?? "",
        sale_end_date: f.sale_end_date ?? "",
      });
      const [{ data: p }, { data: it }, { data: s }] = await Promise.all([
        (supabase as any)
          .from("sale_flyer_pages")
          .select("id,page_number,image_url")
          .eq("sale_flyer_id", id)
          .order("page_number", { ascending: true }),
        (supabase as any)
          .from("sale_flyer_items")
          .select("*")
          .eq("sale_flyer_id", id)
          .order("name", { ascending: true }),
        f.supplier_id
          ? (supabase as any).from("suppliers").select("name").eq("id", f.supplier_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setPages((p || []) as Page[]);
      const loaded = (it || []) as Item[];
      setItems(loaded);
      setEditedItems(loaded.map((i) => ({ ...i })));
      setDeletedItemIds([]);
      setSupplierName((s as any)?.name ?? "");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const runExtract = async () => {
    setError(null);
    setProcessing(true);
    setStatus("Extracting items with AI…");
    try {
      const result = await processSaleFlyer({ data: { flyerId: id } });
      if (!result.success) {
        setError(result.error || "AI extraction failed");
      } else {
        await load();
      }
    } catch (e: any) {
      let msg = e?.message;
      if (e instanceof Response) {
        msg = `${e.status} ${e.statusText}: ${await e.text().catch(() => "")}`;
      }
      setError(msg || String(e));
    } finally {
      setProcessing(false);
      setStatus("");
    }
  };

  const saveDetails = async () => {
    setSaving(true);
    await (supabase as any)
      .from("sale_flyers")
      .update({
        title: form.title.trim() || null,
        sale_start_date: form.sale_start_date || null,
        sale_end_date: form.sale_end_date || null,
      })
      .eq("id", id);
    setSaving(false);
    load();
  };

  const deleteFlyer = async () => {
    if (!confirm("Delete this flyer and all extracted items?")) return;
    setDeleting(true);
    await (supabase as any).from("sale_flyer_items").delete().eq("sale_flyer_id", id);
    await (supabase as any).from("sale_flyer_pages").delete().eq("sale_flyer_id", id);
    await (supabase as any).from("sale_flyers").delete().eq("id", id);
    setDeleting(false);
    if (flyer?.supplier_id) {
      navigate({ to: "/admin/suppliers/$id", params: { id: flyer.supplier_id } });
    } else {
      navigate({ to: "/admin/suppliers" });
    }
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setEditedItems((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };
      const sp = merged.sale_price;
      const rp = merged.regular_price;
      if (sp != null && rp != null && rp >= sp) {
        merged.savings = Number((rp - sp).toFixed(2));
      }
      next[idx] = merged;
      return next;
    });
  };

  const removeItem = (idx: number) => {
    setEditedItems((prev) => {
      const it = prev[idx];
      if (it && !it.id.startsWith("new-")) {
        setDeletedItemIds((d) => [...d, it.id]);
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  const addItem = () => {
    setEditedItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: "",
        brand: null,
        pack_size: null,
        unit: null,
        sale_price: null,
        regular_price: null,
        savings: null,
        inventory_item_id: null,
      },
    ]);
  };

  const saveItems = async () => {
    setSavingItems(true);
    try {
      if (deletedItemIds.length > 0) {
        const { error: delErr } = await (supabase as any)
          .from("sale_flyer_items")
          .delete()
          .in("id", deletedItemIds);
        if (delErr) throw delErr;
      }
      const toInsert: any[] = [];
      const toUpdate: any[] = [];
      for (const it of editedItems) {
        if (!it.name.trim()) continue;
        const payload = {
          name: it.name.trim(),
          brand: it.brand?.toString().trim() || null,
          pack_size: it.pack_size?.toString().trim() || null,
          unit: it.unit?.toString().trim() || null,
          sale_price: it.sale_price,
          regular_price: it.regular_price,
          savings: it.savings,
        };
        if (it.id.startsWith("new-")) {
          toInsert.push({ ...payload, sale_flyer_id: id });
        } else {
          toUpdate.push({ id: it.id, ...payload });
        }
      }
      if (toInsert.length > 0) {
        const { error: insErr } = await (supabase as any)
          .from("sale_flyer_items")
          .insert(toInsert);
        if (insErr) throw insErr;
      }
      for (const u of toUpdate) {
        const { id: uid, ...rest } = u;
        const { error: upErr } = await (supabase as any)
          .from("sale_flyer_items")
          .update(rest)
          .eq("id", uid);
        if (upErr) throw upErr;
      }
      toast.success("Items saved");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save items");
    } finally {
      setSavingItems(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!flyer) {
    return (
      <div className="space-y-4">
        <Link
          to="/admin/suppliers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Flyer not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const matched = editedItems.filter((i) => i.inventory_item_id).length;
  const itemsDirty =
    deletedItemIds.length > 0 ||
    editedItems.length !== items.length ||
    editedItems.some((e, i) => {
      const o = items[i];
      if (!o || o.id !== e.id) return true;
      return (
        o.name !== e.name ||
        (o.brand ?? "") !== (e.brand ?? "") ||
        (o.pack_size ?? "") !== (e.pack_size ?? "") ||
        (o.unit ?? "") !== (e.unit ?? "") ||
        (o.sale_price ?? null) !== (e.sale_price ?? null) ||
        (o.regular_price ?? null) !== (e.regular_price ?? null)
      );
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        {flyer.supplier_id ? (
          <Link
            to="/admin/suppliers/$id"
            params={{ id: flyer.supplier_id }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Back to {supplierName || "supplier"}
          </Link>
        ) : (
          <Link
            to="/admin/suppliers"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={deleteFlyer}
            disabled={deleting || processing}
            className="gap-2"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </Button>
          <FlippGenerateButton
            target={{ kind: "sale_flyer", id: flyer.id }}
            values={[
              { name: "title", value: flyer.title ?? null },
              { name: "supplier", value: supplierName || null },
              { name: "sale_start_date", value: flyer.sale_start_date ?? null },
              { name: "sale_end_date", value: flyer.sale_end_date ?? null },
              { name: "item_count", value: String(editedItems.length) },
            ]}
            onGenerated={(url) => setFlyer({ ...flyer, image_url: url })}
          />
          <Button
            type="button"
            onClick={runExtract}
            disabled={processing || pages.length === 0}
            className="bg-gradient-warm text-primary-foreground gap-2"
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {flyer.status === "processed" ? "Re-extract with AI" : "Extract with AI"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl flex items-center gap-2">
              <Tag className="w-6 h-6 text-primary" />
              {flyer.title || "Untitled flyer"}
            </h1>
            <Badge variant={flyer.status === "processed" ? "default" : "secondary"}>
              {flyer.status}
            </Badge>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start">Sale start</Label>
              <Input
                id="start"
                type="date"
                value={form.sale_start_date}
                onChange={(e) => setForm({ ...form, sale_start_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Sale end</Label>
              <Input
                id="end"
                type="date"
                value={form.sale_end_date}
                onChange={(e) => setForm({ ...form, sale_end_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Button onClick={saveDetails} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save details
            </Button>
          </div>
          {(flyer.sale_start_date || flyer.sale_end_date) && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarRange className="w-3 h-3" />
              {flyer.sale_start_date || "?"} → {flyer.sale_end_date || "?"}
            </p>
          )}
          {status && (
            <p className="text-xs text-primary font-medium flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> {status}
            </p>
          )}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded p-3">{error}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">Pages</p>
            <span className="text-xs text-muted-foreground">{pages.length}</span>
          </div>
          {pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pages.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pages.map((p) => (
                <a
                  key={p.id}
                  href={p.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border border-border/60 rounded-lg overflow-hidden bg-muted"
                >
                  <img
                    src={p.image_url}
                    alt={`Page ${p.page_number}`}
                    className="w-full h-40 object-cover"
                  />
                  <div className="text-[10px] px-2 py-1 text-muted-foreground">p{p.page_number}</div>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-medium">Extracted items</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {editedItems.length} item{editedItems.length === 1 ? "" : "s"}
                {editedItems.length > 0 && ` · ${matched} matched`}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveItems}
                disabled={savingItems || !itemsDirty}
                className="gap-1"
              >
                {savingItems ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save items
              </Button>
            </div>
          </div>
          {editedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {flyer.status === "processed"
                ? "No items. Tap Add to create one."
                : "Tap Extract with AI to read items from the pages, or Add to enter manually."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 pr-2 min-w-[180px]">Name</th>
                    <th className="text-left py-2 pr-2 min-w-[120px]">Brand</th>
                    <th className="text-left py-2 pr-2 min-w-[110px]">Pack</th>
                    <th className="text-left py-2 pr-2 min-w-[80px]">Unit</th>
                    <th className="text-right py-2 pr-2 min-w-[90px]">Sale</th>
                    <th className="text-right py-2 pr-2 min-w-[90px]">Reg</th>
                    <th className="text-right py-2 pr-2 min-w-[80px]">Save</th>
                    <th className="py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {editedItems.map((it, idx) => (
                    <tr key={it.id} className="border-b border-border/30 align-top">
                      <td className="py-1.5 pr-2">
                        <Input
                          value={it.name}
                          onChange={(e) => updateItem(idx, { name: e.target.value })}
                          placeholder="Item name"
                          className="h-8"
                        />
                        {it.inventory_item_id && (
                          <Badge className="mt-1 bg-primary/15 text-primary border-primary/30 text-[10px]">
                            matched
                          </Badge>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          value={it.brand ?? ""}
                          onChange={(e) => updateItem(idx, { brand: e.target.value || null })}
                          className="h-8"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          value={it.pack_size ?? ""}
                          onChange={(e) => updateItem(idx, { pack_size: e.target.value || null })}
                          className="h-8"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          value={it.unit ?? ""}
                          onChange={(e) => updateItem(idx, { unit: e.target.value || null })}
                          className="h-8"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={it.sale_price ?? ""}
                          onChange={(e) =>
                            updateItem(idx, {
                              sale_price: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="h-8 text-right"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={it.regular_price ?? ""}
                          onChange={(e) =>
                            updateItem(idx, {
                              regular_price: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="h-8 text-right"
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-right text-emerald-600 dark:text-emerald-400 text-xs">
                        {it.savings != null ? `$${Number(it.savings).toFixed(2)}` : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removeItem(idx)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
