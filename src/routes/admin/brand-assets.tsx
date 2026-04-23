import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";
import type { BrandAssetType } from "@/lib/brand-assets";

export const Route = createFileRoute("/admin/brand-assets")({
  head: () => ({ meta: [{ title: "Brand Assets — Admin" }] }),
  component: BrandAssetsPage,
});

const ASSET_TYPES: { type: BrandAssetType; label: string; description: string; required: boolean }[] = [
  { type: "primary_logo", label: "Primary Logo", description: "Used on public header, footer, and admin sidebar.", required: true },
  { type: "light_logo", label: "Light Logo", description: "Optional variant for dark backgrounds.", required: false },
  { type: "dark_logo", label: "Dark Logo", description: "Optional variant for light backgrounds.", required: false },
  { type: "favicon", label: "Favicon", description: "Optional browser tab icon URL.", required: false },
];

type BrandAssetRow = {
  id: string;
  asset_type: string;
  asset_url: string;
  active: boolean;
  updated_at: string;
};

function BrandAssetsPage() {
  const qc = useQueryClient();
  const { data: assets, isLoading } = useQuery({
    queryKey: ["admin", "brand_assets"],
    queryFn: async (): Promise<BrandAssetRow[]> => {
      const { data, error } = await supabase
        .from("brand_assets")
        .select("id, asset_type, asset_url, active, updated_at")
        .order("asset_type");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <LoadingState label="Loading brand assets…" />;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold mb-1">Brand Assets</h1>
        <p className="text-muted-foreground text-sm">
          Manage logo URLs used across the public site and admin. Leave blank to fall back to the bundled logo.
        </p>
      </div>

      {ASSET_TYPES.map((cfg) => {
        const current = assets?.find((a) => a.asset_type === cfg.type) ?? null;
        return (
          <BrandAssetCard
            key={cfg.type}
            config={cfg}
            current={current}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["admin", "brand_assets"] });
              qc.invalidateQueries({ queryKey: ["brand-asset", cfg.type] });
            }}
          />
        );
      })}
    </div>
  );
}

function BrandAssetCard({
  config,
  current,
  onSaved,
}: {
  config: { type: BrandAssetType; label: string; description: string; required: boolean };
  current: BrandAssetRow | null;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState(current?.asset_url ?? "");
  const [active, setActive] = useState(current?.active ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUrl(current?.asset_url ?? "");
    setActive(current?.active ?? true);
  }, [current?.id, current?.asset_url, current?.active]);

  async function handleSave() {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Asset URL is required");
      return;
    }
    try {
      // Basic URL validation
      new URL(trimmed);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }
    setSaving(true);
    try {
      if (current) {
        const { error } = await supabase
          .from("brand_assets")
          .update({ asset_url: trimmed, active })
          .eq("id", current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("brand_assets")
          .insert({ asset_type: config.type, asset_url: trimmed, active });
        if (error) throw error;
      }
      toast.success(`${config.label} saved`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!current) return;
    if (!confirm(`Remove the ${config.label} URL?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("brand_assets").delete().eq("id", current.id);
      if (error) throw error;
      toast.success(`${config.label} removed`);
      setUrl("");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to remove");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-4">
          <span>
            {config.label}
            {config.required && <span className="ml-2 text-xs text-muted-foreground">(required)</span>}
          </span>
          {current && (
            <span className="text-xs font-normal text-muted-foreground">
              Updated {new Date(current.updated_at).toLocaleString()}
            </span>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{config.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {url && (
          <div className="rounded-md border border-border bg-muted/30 p-4 flex items-center justify-center min-h-[80px]">
            <img
              src={url}
              alt={`${config.label} preview`}
              className="max-h-16 w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor={`url-${config.type}`}>Asset URL</Label>
          <Input
            id={`url-${config.type}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id={`active-${config.type}`} checked={active} onCheckedChange={setActive} />
          <Label htmlFor={`active-${config.type}`} className="cursor-pointer">Active</Label>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : current ? "Update" : "Save"}
          </Button>
          {current && (
            <Button variant="outline" onClick={handleClear} disabled={saving}>
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
