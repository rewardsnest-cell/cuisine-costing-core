// Pricing v2 — Stage -1: Recipe Ingredient Weight Normalization page.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  runRecipeNormalize,
  listNormalizeRuns,
  listNormalizeErrors,
  listBlockedIngredients,
  setIngredientManualGrams,
  mapIngredientToInventory,
  traceRecipeNormalization,
  searchRecipesForNormalize,
  runRecipeNormalizeTestHarness,
  getRecipeNormalizationGate,
} from "@/lib/server-fns/pricing-v2-recipe-normalize.functions";

export const Route = createFileRoute("/admin/pricing-v2/recipes-normalize")({
  head: () => ({ meta: [{ title: "Pricing v2 — Stage -1 Recipe Normalization" }] }),
  component: RecipesNormalizePage,
});

type RunResult = Awaited<ReturnType<typeof runRecipeNormalize>>;
type TestResult = Awaited<ReturnType<typeof runRecipeNormalizeTestHarness>>;

function RecipesNormalizePage() {
  const qc = useQueryClient();

  const gate = useQuery({
    queryKey: ["pricing-v2", "norm", "gate"],
    queryFn: () => getRecipeNormalizationGate(),
  });
  const runs = useQuery({
    queryKey: ["pricing-v2", "norm", "runs"],
    queryFn: () => listNormalizeRuns(),
  });
  const blocked = useQuery({
    queryKey: ["pricing-v2", "norm", "blocked"],
    queryFn: () => listBlockedIngredients(),
  });

  const [recipeId, setRecipeId] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [includeAll, setIncludeAll] = useState(false);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [lastTestResult, setLastTestResult] = useState<TestResult | null>(null);
  const [errFilterRun, setErrFilterRun] = useState("");

  const errors = useQuery({
    queryKey: ["pricing-v2", "norm", "errors", errFilterRun],
    queryFn: () =>
      listNormalizeErrors({
        data: { run_id: errFilterRun || undefined, limit: 200 },
      }),
  });

  const runMut = useMutation({
    mutationFn: (vars: {
      dry_run: boolean;
      recipe_id?: string;
      ingredient_id?: string;
      include_already_normalized: boolean;
    }) => runRecipeNormalize({ data: vars }),
    onSuccess: (res) => {
      setLastResult(res);
      setErrFilterRun(res.run_id);
      toast[res.errors_count ? "error" : "success"](
        `${res.dry_run ? "Dry run" : "Normalize"} done — in:${res.counts_in} normalized:${res.counts_out} blocked:${res.blocked_count}`
      );
      qc.invalidateQueries({ queryKey: ["pricing-v2", "norm"] });
      qc.invalidateQueries({ queryKey: ["pricing-v2", "overview"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Run failed"),
  });

  const testMut = useMutation({
    mutationFn: () => runRecipeNormalizeTestHarness(),
    onSuccess: (res) => {
      setLastTestResult(res);
      setErrFilterRun(res.run_id);
      if (res.failed === 0) toast.success(`Test harness: ${res.passed}/${res.total} passed`);
      else toast.error(`Test harness: ${res.failed} of ${res.total} failed`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "norm"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Test harness failed"),
  });

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Stage -1 — Recipe Weight Normalization
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Converts every recipe ingredient to grams. Pricing stages are{" "}
              <strong>blocked</strong> until every ingredient is normalized. Errors land in{" "}
              <Link to="/admin/pricing-v2/errors" className="underline">Pricing v2 Errors</Link>.
            </p>
          </div>
          <GateBadge gate={gate.data} />
        </div>
      </header>

      {/* Run controls */}
      <Card>
        <CardHeader><CardTitle>Run Controls</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="recipe_id">Recipe ID (subset)</Label>
              <Input id="recipe_id" placeholder="optional uuid" value={recipeId} onChange={(e) => setRecipeId(e.target.value.trim())} className="font-mono text-xs" />
            </div>
            <div>
              <Label htmlFor="ing_id">Ingredient ID (subset)</Label>
              <Input id="ing_id" placeholder="optional uuid" value={ingredientId} onChange={(e) => setIngredientId(e.target.value.trim())} className="font-mono text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="include-all" checked={includeAll} onCheckedChange={setIncludeAll} />
            <Label htmlFor="include-all" className="cursor-pointer">Include already normalized</Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                runMut.mutate({
                  dry_run: false,
                  recipe_id: recipeId || undefined,
                  ingredient_id: ingredientId || undefined,
                  include_already_normalized: includeAll,
                })
              }
              disabled={runMut.isPending}
            >
              Run Normalization
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                runMut.mutate({
                  dry_run: true,
                  recipe_id: recipeId || undefined,
                  ingredient_id: ingredientId || undefined,
                  include_already_normalized: includeAll,
                })
              }
              disabled={runMut.isPending}
            >
              Dry Run
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                runMut.mutate({
                  dry_run: false,
                  recipe_id: recipeId || undefined,
                  ingredient_id: ingredientId || undefined,
                  include_already_normalized: includeAll,
                })
              }
              disabled={runMut.isPending || (!recipeId && !ingredientId)}
            >
              Run Subset
            </Button>
            <Button variant="ghost" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
              Run Test Cases
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Last run results */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              Last Run
              <Badge variant={lastResult.errors_count > 0 ? "destructive" : "default"}>
                {lastResult.errors_count > 0 ? "BLOCKED" : "OK"}
              </Badge>
              {lastResult.dry_run && <Badge variant="outline">dry_run</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="run_id" value={<span className="font-mono text-xs break-all">{lastResult.run_id}</span>} />
              <Stat label="processed" value={lastResult.counts_in} />
              <Stat label="normalized" value={lastResult.counts_out} />
              <Stat label="blocked" value={lastResult.blocked_count} />
              <Stat label="errors" value={lastResult.errors_count} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Block reason breakdown</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(lastResult.breakdown).map(([k, v]) => (
                  <Badge key={k} variant={v > 0 ? "destructive" : "outline"}>
                    {k}: {v}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="default" asChild>
                <Link
                  to="/admin/pricing-v2/errors"
                  search={{ run_id: lastResult.run_id, stage: "recipe_weight_normalization" } as any}
                >
                  Open Errors Page for this run
                </Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportErrorsCsv(lastResult.run_id)}>
                Download Error Report (CSV)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => downloadJson(`pv2-norm-${lastResult.run_id}.json`, lastResult)}>
                Download Run Summary JSON
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Harness Results */}
      {lastTestResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              Test Harness Results
              <Badge variant={lastTestResult.failed === 0 ? "default" : "destructive"}>
                {lastTestResult.failed === 0 ? "ALL PASS" : `${lastTestResult.failed} FAILED`}
              </Badge>
              <Badge variant="outline">stage: recipe_weight_normalization_test</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="run_id" value={<span className="font-mono text-xs break-all">{lastTestResult.run_id}</span>} />
              <Stat label="total" value={lastTestResult.total} />
              <Stat label="passed" value={lastTestResult.passed} />
              <Stat label="failed" value={lastTestResult.failed} />
              <Stat label="errors" value={lastTestResult.errors_count} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">result</th>
                    <th className="pr-2">case</th>
                    <th className="pr-2">expected</th>
                    <th className="pr-2">actual</th>
                    <th className="pr-2">detail</th>
                  </tr>
                </thead>
                <tbody>
                  {lastTestResult.results.map((t) => (
                    <tr key={t.id} className="border-t align-top">
                      <td className="py-1 pr-2">
                        <Badge variant={t.pass ? "default" : "destructive"}>{t.pass ? "PASS" : "FAIL"}</Badge>
                      </td>
                      <td className="pr-2">{t.name}</td>
                      <td className="pr-2 font-mono">
                        {t.expect_ok
                          ? `${(t.expect_grams ?? 0).toFixed(3)} g · ${t.expect_status}`
                          : `${t.expect_status} · ${t.expect_error_type ?? "any"}`}
                      </td>
                      <td className="pr-2 font-mono">
                        {t.actual_grams != null
                          ? `${t.actual_grams.toFixed(3)} g · ${t.actual_status}`
                          : `${t.actual_status} · ${t.actual_error_type ?? "—"}`}
                      </td>
                      <td className="pr-2 text-muted-foreground max-w-[40ch]">{t.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="default" asChild>
                <Link
                  to="/admin/pricing-v2/errors"
                  search={{ run_id: lastTestResult.run_id, stage: "recipe_weight_normalization_test" } as any}
                >
                  Open Errors Page for this run
                </Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportErrorsCsv(lastTestResult.run_id)}>
                Download Error Report (CSV)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => downloadJson(`pv2-norm-test-${lastTestResult.run_id}.json`, lastTestResult)}>
                Download Test Summary JSON
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent runs */}
      <Card>
        <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {runs.isLoading ? <p>Loading…</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1 pr-2">run_id</th><th>stage</th><th>status</th><th>started</th><th>in</th><th>out</th><th>err</th><th>notes</th></tr>
                </thead>
                <tbody>
                  {(runs.data?.runs ?? []).map((r: any) => (
                    <tr key={r.run_id} className="border-t">
                      <td className="py-1 pr-2 font-mono">
                        <button className="underline" onClick={() => setErrFilterRun(r.run_id)}>{r.run_id.slice(0, 8)}…</button>
                      </td>
                      <td className="font-mono text-[10px]">{r.stage}</td>
                      <td>{r.status}</td>
                      <td>{new Date(r.started_at).toLocaleString()}</td>
                      <td>{r.counts_in}</td>
                      <td>{r.counts_out}</td>
                      <td>{r.errors_count}</td>
                      <td className="text-muted-foreground truncate max-w-[24ch]">{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blocked ingredients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
            <span>Blocked Ingredients ({blocked.data?.rows.length ?? 0})</span>
            <span className="text-xs font-normal text-muted-foreground">All rows whose status is not <code>normalized</code></span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BlockedTable rows={blocked.data?.rows ?? []} loading={blocked.isLoading} onChanged={() => {
            qc.invalidateQueries({ queryKey: ["pricing-v2", "norm"] });
          }} />
        </CardContent>
      </Card>

      {/* Errors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
            <span>Errors (stage = recipe_weight_normalization*)</span>
            <div className="flex items-center gap-2 text-sm font-normal">
              <Input className="h-8 w-[26ch] font-mono text-xs" placeholder="filter by run_id" value={errFilterRun} onChange={(e) => setErrFilterRun(e.target.value.trim())} />
              <Button size="sm" variant="ghost" onClick={() => setErrFilterRun("")}>Clear</Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorsTable rows={errors.data?.errors ?? []} loading={errors.isLoading} />
        </CardContent>
      </Card>

      {/* Trace */}
      <RecipeTraceCard />
    </div>
  );
}

function GateBadge({ gate }: { gate: Awaited<ReturnType<typeof getRecipeNormalizationGate>> | undefined }) {
  if (!gate) return null;
  return (
    <div className="text-right text-xs">
      <Badge variant={gate.pricing_allowed ? "default" : "destructive"} className="mb-1">
        {gate.pricing_allowed ? "Pricing ALLOWED" : "Pricing BLOCKED"}
      </Badge>
      <div className="text-muted-foreground">
        {gate.normalized_ingredients}/{gate.total_ingredients} normalized
        {gate.blocked_ingredients > 0 && <> · <span className="text-destructive">{gate.blocked_ingredients} blocked</span></>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function ErrorsTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) return <p className="text-sm">Loading…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No errors for this filter.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1 pr-2">severity</th><th>type</th><th>entity</th><th>message</th><th>suggested fix</th><th>debug</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t align-top">
              <td className="py-1 pr-2"><Badge variant="destructive">{e.severity}</Badge></td>
              <td className="font-mono">{e.type}</td>
              <td className="break-all max-w-[28ch]">{e.entity_name ?? e.entity_id ?? "—"}</td>
              <td className="max-w-[40ch]">{e.message}</td>
              <td className="max-w-[30ch] text-muted-foreground">{e.suggested_fix}</td>
              <td>
                <details>
                  <summary className="cursor-pointer text-muted-foreground">view</summary>
                  <pre className="text-[10px] whitespace-pre-wrap break-all max-w-[40ch]">{JSON.stringify(e.debug_json, null, 2)}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlockedTable({ rows, loading, onChanged }: { rows: any[]; loading: boolean; onChanged: () => void }) {
  const [openOverride, setOpenOverride] = useState<string | null>(null);
  const [grams, setGrams] = useState("");
  const [reason, setReason] = useState("");
  const [openMap, setOpenMap] = useState<string | null>(null);
  const [invId, setInvId] = useState("");

  const qc = useQueryClient();

  const saveOverride = useMutation({
    mutationFn: (ingredient_id: string) =>
      setIngredientManualGrams({ data: { ingredient_id, grams: Number(grams), reason } }),
    onSuccess: () => {
      toast.success("Manual override saved");
      setOpenOverride(null); setGrams(""); setReason("");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const saveMap = useMutation({
    mutationFn: (ingredient_id: string) =>
      mapIngredientToInventory({ data: { ingredient_id, inventory_item_id: invId || null } }),
    onSuccess: () => {
      toast.success("Inventory mapping saved");
      setOpenMap(null); setInvId("");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const retryOne = useMutation({
    mutationFn: (ingredient_id: string) =>
      runRecipeNormalize({
        data: { dry_run: false, ingredient_id, include_already_normalized: true },
      }),
    onSuccess: (res) => {
      toast.success(`Retried — normalized:${res.counts_out} blocked:${res.blocked_count}`);
      qc.invalidateQueries({ queryKey: ["pricing-v2", "norm"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed"),
  });

  if (loading) return <p className="text-sm">Loading…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No blocked ingredients. ✅</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-2">recipe</th>
            <th>ingredient</th>
            <th>qty</th>
            <th>unit</th>
            <th>block reason</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="py-1 pr-2">{r.recipes?.name ?? "—"}</td>
              <td>{r.name}</td>
              <td className="font-mono">{r.quantity}</td>
              <td className="font-mono">{r.unit}</td>
              <td className="max-w-[30ch]">
                <Badge variant="destructive" className="mb-1">{r.normalization_status}</Badge>
                <div className="text-muted-foreground text-[11px]">{r.conversion_notes}</div>
              </td>
              <td>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setOpenMap(openMap === r.id ? null : r.id)}>
                      Map inventory
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setOpenOverride(openOverride === r.id ? null : r.id)}>
                      Override grams
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => retryOne.mutate(r.id)} disabled={retryOne.isPending}>
                      Retry
                    </Button>
                  </div>
                  {openMap === r.id && (
                    <div className="border rounded p-2 space-y-1 bg-muted/30">
                      <Label className="text-[10px]">inventory_item_id (uuid, blank = unmap)</Label>
                      <Input value={invId} onChange={(e) => setInvId(e.target.value.trim())} className="h-7 font-mono text-[10px]" />
                      <Button size="sm" onClick={() => saveMap.mutate(r.id)} disabled={saveMap.isPending}>Save mapping</Button>
                    </div>
                  )}
                  {openOverride === r.id && (
                    <div className="border rounded p-2 space-y-1 bg-muted/30">
                      <Label className="text-[10px]">grams</Label>
                      <Input value={grams} onChange={(e) => setGrams(e.target.value.replace(/[^\d.]/g, ""))} className="h-7" inputMode="decimal" />
                      <Label className="text-[10px]">reason (required)</Label>
                      <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                      <Button size="sm" onClick={() => saveOverride.mutate(r.id)} disabled={!grams || !reason || saveOverride.isPending}>Save override</Button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecipeTraceCard() {
  const [q, setQ] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const search = useQuery({
    queryKey: ["pricing-v2", "norm", "recipes-search", q],
    queryFn: () => searchRecipesForNormalize({ data: { q } }),
  });
  const trace = useQuery({
    queryKey: ["pricing-v2", "norm", "trace", recipeId],
    queryFn: () => traceRecipeNormalization({ data: { recipe_id: recipeId } }),
    enabled: !!recipeId,
  });

  return (
    <Card>
      <CardHeader><CardTitle>Recipe Trace</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="search recipes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {(search.data?.recipes ?? []).map((r: any) => (
            <Button key={r.id} size="sm" variant={recipeId === r.id ? "default" : "outline"} onClick={() => setRecipeId(r.id)}>
              {r.name}
            </Button>
          ))}
        </div>
        {trace.data && (
          <div className="overflow-x-auto">
            <div className="font-medium text-sm mb-2">{trace.data.recipe?.name}</div>
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">ingredient</th>
                  <th>orig qty</th>
                  <th>orig unit</th>
                  <th>grams</th>
                  <th>source</th>
                  <th>status</th>
                  <th>notes</th>
                </tr>
              </thead>
              <tbody>
                {trace.data.ingredients.map((i: any) => (
                  <tr key={i.id} className="border-t align-top">
                    <td className="py-1 pr-2">{i.name}</td>
                    <td className="font-mono">{i.original_quantity ?? i.quantity}</td>
                    <td className="font-mono">{i.original_unit ?? i.unit}</td>
                    <td className="font-mono">{i.quantity_grams != null ? Number(i.quantity_grams).toFixed(3) : "—"}</td>
                    <td className="font-mono text-[11px]">{i.conversion_source ?? "—"}</td>
                    <td>
                      <Badge variant={i.normalization_status === "normalized" ? "default" : "destructive"}>
                        {i.normalization_status ?? "(not run)"}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground max-w-[30ch] text-[11px]">{i.conversion_notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Helpers --------------------------------------------------------------

function downloadJson(name: string, payload: any) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportErrorsCsv(runId: string) {
  const res = await listNormalizeErrors({ data: { run_id: runId, limit: 1000 } });
  const rows = res.errors;
  const headers = ["created_at", "severity", "type", "entity_id", "entity_name", "message", "suggested_fix"];
  const csv = [
    headers.join(","),
    ...rows.map((r: any) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pv2-norm-errors-${runId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
