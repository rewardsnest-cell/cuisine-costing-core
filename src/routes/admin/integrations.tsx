import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Loader2, Sparkles, Image as ImageIcon, Globe, Mail, Database, ArrowRight, Settings, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { getIntegrationsStatus, testFlipp, testLovableAI, testFirecrawl, setIntegrationConfig } from "@/lib/server-fns/integrations-status.functions";
import { getFlippAttribution } from "@/lib/server-fns/flipp-attribution.functions";

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({ meta: [{ title: "API Integrations — Admin" }] }),
  component: IntegrationsPage,
});

const ICONS: Record<string, any> = {
  flipp: ImageIcon, lovable_ai: Sparkles, firecrawl: Globe, email: Mail, storage: Database,
};

type EditableField = { kvKey: string; label: string; placeholder?: string; helper?: string };

const EDITABLE_FIELDS: Record<string, EditableField[]> = {
  flipp: [
    { kvKey: "integration.flipp.recipe_template_id", label: "Recipe template ID", placeholder: "tpl_…", helper: "Used for recipe coupon/social images." },
    { kvKey: "integration.flipp.flyer_template_id", label: "Flyer template ID", placeholder: "tpl_…", helper: "Used for individual sale-flyer item promos." },
  ],
};

function IntegrationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getIntegrationsStatus();
      setItems(data);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const runTest = async (key: string) => {
    setTesting(key);
    try {
      const fn = key === "flipp" ? testFlipp : key === "lovable_ai" ? testLovableAI : key === "firecrawl" ? testFirecrawl : null;
      if (!fn) return;
      const res = await fn();
      if (res.ok) toast.success(res.message); else toast.error(res.message);
    } catch (e: any) {
      toast.error(e?.message || "Test failed");
    } finally { setTesting(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">API Integrations</h1>
          <p className="text-sm text-muted-foreground">Status of every external service the app talks to. Edit config here; manage secret keys in Cloud.</p>
        </div>
        <Link to="/admin/affiliates"><Button variant="outline">Affiliates →</Button></Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading status…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map(item => {
            const Icon = ICONS[item.key] || Sparkles;
            const editable = EDITABLE_FIELDS[item.key];
            const tokenName = item.details?.token_secret_name as string | undefined;
            return (
              <Card key={item.key}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="w-4 h-4" />{item.label}
                    </CardTitle>
                    {item.configured
                      ? <Badge className="gap-1"><CheckCircle2 className="w-3 h-3" />Connected</Badge>
                      : <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Not configured</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ItemDetails item={item} />
                  <div className="flex flex-wrap gap-2">
                    {(["flipp", "lovable_ai", "firecrawl"].includes(item.key)) && (
                      <Button size="sm" variant="outline" disabled={!item.configured || testing === item.key} onClick={() => runTest(item.key)}>
                        {testing === item.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test"}
                      </Button>
                    )}
                    {editable && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(item)}>
                        <Settings className="w-3.5 h-3.5" />Edit config
                      </Button>
                    )}
                    {tokenName && (
                      <Button size="sm" variant="outline" className="gap-1" asChild>
                        <a href={`https://supabase.com/dashboard/project/${import.meta.env.VITE_SUPABASE_PROJECT_ID}/settings/functions`} target="_blank" rel="noreferrer">
                          <KeyRound className="w-3.5 h-3.5" />Manage {tokenName}
                        </a>
                      </Button>
                    )}
                    {item.key === "email" && <Link to="/admin/exports"><Button size="sm" variant="outline" className="gap-1">View logs <ArrowRight className="w-3 h-3" /></Button></Link>}
                    {item.key === "flipp" && <Link to="/admin/recipes"><Button size="sm" variant="outline" className="gap-1">Use it <ArrowRight className="w-3 h-3" /></Button></Link>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <FlippAttributionPanel />

      <EditConfigDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </div>
  );
}

function EditConfigDialog({ item, onClose, onSaved }: { item: any | null; onClose: () => void; onSaved: () => void }) {
  const fields: EditableField[] = item ? (EDITABLE_FIELDS[item.key] ?? []) : [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    const initial: Record<string, string> = {};
    if (item.key === "flipp") {
      initial["integration.flipp.recipe_template_id"] = item.details?.recipe_template_id ?? "";
      initial["integration.flipp.flyer_template_id"] = item.details?.flyer_template_id ?? "";
    }
    setValues(initial);
  }, [item]);

  const save = async () => {
    setSaving(true);
    try {
      for (const f of fields) {
        await setIntegrationConfig({ data: { key: f.kvKey, value: values[f.kvKey] ?? "" } });
      }
      toast.success("Config saved");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {item?.label}</DialogTitle>
          <DialogDescription>
            These values are stored in your database and override env defaults. Secret keys (API tokens) must be managed in Cloud → Secrets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {fields.map((f) => (
            <div key={f.kvKey} className="space-y-1.5">
              <Label htmlFor={f.kvKey}>{f.label}</Label>
              <Input
                id={f.kvKey}
                placeholder={f.placeholder}
                value={values[f.kvKey] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.kvKey]: e.target.value }))}
              />
              {f.helper && <p className="text-xs text-muted-foreground">{f.helper}</p>}
            </div>
          ))}
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">No editable config for this integration. Manage its secret in Cloud.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || fields.length === 0}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemDetails({ item }: { item: any }) {
  const d = item.details || {};
  if (item.key === "flipp") {
    return (
      <div className="text-xs text-muted-foreground space-y-1">
        <div>Recipe template: <code className="text-foreground">{d.recipe_template_id || "not set"}</code></div>
        <div>Flyer template: <code className="text-foreground">{d.flyer_template_id || "not set"}</code></div>
      </div>
    );
  }
  if (item.key === "lovable_ai") {
    return <div className="text-xs text-muted-foreground">Models: {(d.models || []).join(", ")}</div>;
  }
  if (item.key === "email") {
    const s = d.last7days || {};
    return (
      <div className="text-xs text-muted-foreground">
        Last 7 days — <span className="text-foreground font-medium">{s.total || 0}</span> emails
        {" · "}<span className="text-primary">{s.sent || 0} sent</span>
        {" · "}<span className="text-destructive">{s.failed || 0} failed</span>
        {" · "}{s.suppressed || 0} suppressed
      </div>
    );
  }
  if (item.key === "storage") {
    const buckets = d.buckets || {};
    return (
      <div className="text-xs text-muted-foreground space-y-0.5">
        {Object.entries(buckets).map(([name, info]: any) => (
          <div key={name}>{name}: <span className="text-foreground">{info.count}</span> files · {(info.bytes / 1024 / 1024).toFixed(1)} MB</div>
        ))}
      </div>
    );
  }
  if (item.key === "firecrawl") {
    return <div className="text-xs text-muted-foreground">Web scraping & content extraction.</div>;
  }
  return null;
}
