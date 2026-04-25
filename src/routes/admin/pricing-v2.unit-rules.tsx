// Pricing v2 — Unit Conversion Rules admin.
// Manages pricing_v2_unit_conversion_rules used by Stage -1 normalization
// when no inventory-based weight is available.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Save, Plus } from "lucide-react";
import {
  listUnitConversionRules,
  upsertUnitConversionRule,
  deleteUnitConversionRule,
} from "@/lib/server-fns/pricing-v2-recipe-normalize.functions";

export const Route = createFileRoute("/admin/pricing-v2/unit-rules")({
  head: () => ({ meta: [{ title: "Pricing v2 — Unit Conversion Rules" }] }),
  component: UnitRulesPage,
});

type Rule = {
  unit: string;
  grams_per_unit: number | null;
  requires_density: boolean;
  notes: string | null;
  updated_at: string;
};

function UnitRulesPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["pricing-v2", "unit-rules"],
    queryFn: () => listUnitConversionRules(),
  });

  const upsert = useMutation({
    mutationFn: (vars: {
      unit: string;
      grams_per_unit: number | null;
      requires_density: boolean;
      notes: string | null;
    }) => upsertUnitConversionRule({ data: vars }),
    onSuccess: (res) => {
      toast.success(`Saved rule "${res.unit}"`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "unit-rules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const del = useMutation({
    mutationFn: (unit: string) => deleteUnitConversionRule({ data: { unit } }),
    onSuccess: (res) => {
      toast.success(`Deleted "${res.unit}"`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "unit-rules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  // New-rule form state
  const [nUnit, setNUnit] = useState("");
  const [nGrams, setNGrams] = useState("");
  const [nDensity, setNDensity] = useState(false);
  const [nNotes, setNNotes] = useState("");

  const rules: Rule[] = list.data?.rules ?? [];
  const safeCount = useMemo(() => rules.filter((r) => !r.requires_density && r.grams_per_unit).length, [rules]);
  const blockedCount = rules.length - safeCount;

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Pricing v2 — Unit Conversion Rules
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Used by Stage -1 normalization when no inventory weight (each_weight_grams /
          pack_weight_grams) is available. Rules with{" "}
          <span className="font-mono">requires_density=true</span> always BLOCK to avoid
          guessing densities.
        </p>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="total rules" value={rules.length} />
        <Stat label="auto-convert" value={safeCount} />
        <Stat label="density-required (blocks)" value={blockedCount} />
      </div>

      {/* New rule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add / Update Rule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                placeholder="e.g. tbsp"
                value={nUnit}
                onChange={(e) => setNUnit(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Stored lowercase.</p>
            </div>
            <div>
              <Label htmlFor="grams">grams_per_unit</Label>
              <Input
                id="grams"
                inputMode="decimal"
                placeholder="e.g. 14.3"
                value={nGrams}
                disabled={nDensity}
                onChange={(e) => setNGrams(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Required unless density is needed.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Switch
                id="dens"
                checked={nDensity}
                onCheckedChange={(v) => setNDensity(!!v)}
              />
              <Label htmlFor="dens">requires_density</Label>
            </div>
            <div className="md:col-span-1">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="e.g. USDA average"
                value={nNotes}
                onChange={(e) => setNNotes(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Button
              size="sm"
              onClick={() => {
                const grams = nGrams.trim() ? Number(nGrams) : null;
                if (!nDensity && (grams == null || !(grams > 0))) {
                  toast.error("grams_per_unit must be > 0 (or enable requires_density).");
                  return;
                }
                upsert.mutate(
                  {
                    unit: nUnit.trim(),
                    grams_per_unit: nDensity ? null : grams,
                    requires_density: nDensity,
                    notes: nNotes.trim() || null,
                  },
                  {
                    onSuccess: () => {
                      setNUnit("");
                      setNGrams("");
                      setNDensity(false);
                      setNNotes("");
                    },
                  }
                );
              }}
              disabled={upsert.isPending || !nUnit.trim()}
              className="gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Save Rule
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing rules */}
      <Card>
        <CardHeader>
          <CardTitle>Existing Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-2">unit</th>
                    <th className="pr-2">grams_per_unit</th>
                    <th className="pr-2">requires_density</th>
                    <th className="pr-2">notes</th>
                    <th className="pr-2">updated</th>
                    <th className="pr-2 text-right">actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <RuleRow
                      key={r.unit}
                      rule={r}
                      onSave={(patch) =>
                        upsert.mutate({
                          unit: r.unit,
                          grams_per_unit: patch.requires_density
                            ? null
                            : patch.grams_per_unit,
                          requires_density: patch.requires_density,
                          notes: patch.notes,
                        })
                      }
                      onDelete={() => {
                        if (confirm(`Delete rule "${r.unit}"?`)) del.mutate(r.unit);
                      }}
                      saving={upsert.isPending}
                      deleting={del.isPending}
                    />
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

function RuleRow({
  rule,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  rule: Rule;
  onSave: (patch: { grams_per_unit: number | null; requires_density: boolean; notes: string | null }) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [grams, setGrams] = useState(rule.grams_per_unit?.toString() ?? "");
  const [density, setDensity] = useState(rule.requires_density);
  const [notes, setNotes] = useState(rule.notes ?? "");
  const dirty =
    grams !== (rule.grams_per_unit?.toString() ?? "") ||
    density !== rule.requires_density ||
    notes !== (rule.notes ?? "");

  return (
    <tr className="border-t align-top">
      <td className="py-2 pr-2 font-mono">{rule.unit}</td>
      <td className="pr-2">
        <Input
          inputMode="decimal"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          disabled={density}
          className="h-8 w-28"
        />
      </td>
      <td className="pr-2">
        <div className="flex items-center gap-2">
          <Switch checked={density} onCheckedChange={(v) => setDensity(!!v)} />
          {density ? (
            <Badge variant="destructive">blocks</Badge>
          ) : (
            <Badge variant="outline">auto</Badge>
          )}
        </div>
      </td>
      <td className="pr-2">
        <Textarea
          rows={1}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-8 h-8"
        />
      </td>
      <td className="pr-2 text-xs text-muted-foreground">
        {new Date(rule.updated_at).toLocaleString()}
      </td>
      <td className="pr-2 text-right whitespace-nowrap">
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || saving}
          onClick={() => {
            const g = grams.trim() ? Number(grams) : null;
            if (!density && (g == null || !(g > 0))) {
              toast.error("grams_per_unit must be > 0 (or enable requires_density).");
              return;
            }
            onSave({ grams_per_unit: g, requires_density: density, notes: notes.trim() || null });
          }}
          className="gap-1.5 mr-1"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={deleting}
          className="gap-1.5 text-destructive hover:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-display text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
