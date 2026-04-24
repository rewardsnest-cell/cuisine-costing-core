import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";
import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/brand-config")({
  head: () => ({ meta: [{ title: "Brand Configuration — Admin" }] }),
  component: BrandConfigPage,
});

type BrandConfigRow = {
  brand_name: string;
  brand_display_name: string;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
  updated_at: string;
};

type HistoryRow = {
  id: string;
  brand_name: string;
  brand_display_name: string;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
  changed_at: string;
  changed_by: string | null;
};

const COLOR_FIELDS: Array<{ key: keyof BrandConfigRow; label: string }> = [
  { key: "primary_color", label: "Primary" },
  { key: "secondary_color", label: "Secondary" },
  { key: "accent_color", label: "Accent" },
  { key: "background_color", label: "Background" },
  { key: "text_color", label: "Text" },
];

function BrandConfigPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "brand_config"],
    queryFn: async (): Promise<BrandConfigRow | null> => {
      const { data, error } = await supabase
        .from("brand_config")
        .select("brand_name, brand_display_name, primary_color, secondary_color, accent_color, background_color, text_color, updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data as BrandConfigRow | null;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["admin", "brand_config_history"],
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase
        .from("brand_config_history")
        .select("id, brand_name, brand_display_name, primary_color, secondary_color, accent_color, background_color, text_color, changed_at, changed_by")
        .order("changed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });

  const [form, setForm] = useState<BrandConfigRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form) return <LoadingState label="Loading brand configuration…" />;

  const update = (key: keyof BrandConfigRow, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (!form.brand_name.trim() || !form.brand_display_name.trim()) {
      toast.error("Brand name and display name are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: 1,
        brand_name: form.brand_name.trim(),
        brand_display_name: form.brand_display_name.trim(),
        primary_color: form.primary_color?.trim() || null,
        secondary_color: form.secondary_color?.trim() || null,
        accent_color: form.accent_color?.trim() || null,
        background_color: form.background_color?.trim() || null,
        text_color: form.text_color?.trim() || null,
      };
      const { error } = await supabase.from("brand_config").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      toast.success("Brand configuration saved");
      qc.invalidateQueries({ queryKey: ["admin", "brand_config"] });
      qc.invalidateQueries({ queryKey: ["admin", "brand_config_history"] });
      qc.invalidateQueries({ queryKey: ["brand-config"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const revert = async (h: HistoryRow) => {
    if (!confirm(`Revert to version from ${new Date(h.changed_at).toLocaleString()}?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("brand_config")
        .upsert(
          {
            id: 1,
            brand_name: h.brand_name,
            brand_display_name: h.brand_display_name,
            primary_color: h.primary_color,
            secondary_color: h.secondary_color,
            accent_color: h.accent_color,
            background_color: h.background_color,
            text_color: h.text_color,
          },
          { onConflict: "id" },
        );
      if (error) throw error;
      toast.success("Reverted");
      qc.invalidateQueries({ queryKey: ["admin", "brand_config"] });
      qc.invalidateQueries({ queryKey: ["admin", "brand_config_history"] });
      qc.invalidateQueries({ queryKey: ["brand-config"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to revert");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <PageHelpCard route="/admin/brand-config" />

      <div>
        <h1 className="font-display text-3xl text-primary">Brand configuration</h1>
        <p className="text-muted-foreground mt-1">
          Single source of truth for the brand name and color palette. Changes apply across the public site and admin instantly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Brand identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="brand_name">Brand name (canonical)</Label>
              <Input
                id="brand_name"
                value={form.brand_name}
                onChange={(e) => update("brand_name", e.target.value)}
                placeholder="VPSFinest"
              />
              <p className="text-xs text-muted-foreground">No spaces. Used as machine-friendly identifier.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand_display_name">Display name (human-facing)</Label>
              <Input
                id="brand_display_name"
                value={form.brand_display_name}
                onChange={(e) => update("brand_display_name", e.target.value)}
                placeholder="VPS Finest"
              />
              <p className="text-xs text-muted-foreground">Shown in headers, footers, and page titles.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand colors</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Any valid CSS color works (hex like <code>#a05a2c</code>, <code>oklch(...)</code>, <code>rgb(...)</code>). Leave blank to fall back to the default token in the design system.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {COLOR_FIELDS.map(({ key, label }) => {
              const value = (form[key] as string | null) ?? "";
              return (
                <div key={key} className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
                  <div
                    className="h-12 rounded border"
                    style={{ background: value || "transparent" }}
                    aria-hidden
                  />
                  <Input
                    value={value}
                    onChange={(e) => update(key, e.target.value)}
                    placeholder="oklch(0.38 0.045 45) or #a05a2c"
                    className="font-mono text-xs"
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save brand configuration"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change history</CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet — save a change to start the audit log.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 text-sm border-b py-2 last:border-b-0">
                  <div className="flex gap-1">
                    {[h.primary_color, h.secondary_color, h.accent_color, h.background_color, h.text_color].map((c, i) =>
                      c ? (
                        <span
                          key={i}
                          className="inline-block w-4 h-4 rounded border"
                          style={{ background: c }}
                          aria-hidden
                        />
                      ) : (
                        <span key={i} className="inline-block w-4 h-4 rounded border bg-muted" aria-hidden />
                      ),
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{h.brand_display_name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(h.changed_at).toLocaleString()}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => revert(h)} disabled={saving}>
                    Revert
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
