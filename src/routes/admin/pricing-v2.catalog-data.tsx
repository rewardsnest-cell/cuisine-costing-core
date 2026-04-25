// Pricing v2 — Catalog Data Viewer.
// Read-only browse of pricing_v2_item_catalog and pricing_v2_kroger_catalog_raw,
// plus inventory mapping coverage stats.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RefreshCw, Database, Boxes, AlertTriangle, Download } from "lucide-react";
import {
  listItemCatalog,
  listKrogerCatalogRaw,
  getCatalogStats,
} from "@/lib/server-fns/pricing-v2-search.functions";

export const Route = createFileRoute("/admin/pricing-v2/catalog-data")({
  head: () => ({ meta: [{ title: "Pricing v2 — Catalog Data" }] }),
  component: CatalogDataPage,
});

function CatalogDataPage() {
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const stats = useQuery({
    queryKey: ["pricing-v2", "catalog-data", "stats"],
    queryFn: () => getCatalogStats(),
  });

  const normalized = useQuery({
    queryKey: ["pricing-v2", "catalog-data", "normalized", activeSearch],
    queryFn: () => listItemCatalog({ data: { search: activeSearch || undefined, limit: 200 } }),
  });

  const raw = useQuery({
    queryKey: ["pricing-v2", "catalog-data", "raw", activeSearch],
    queryFn: () => listKrogerCatalogRaw({ data: { search: activeSearch || undefined, limit: 200 } }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(search.trim());
  };

  const refreshAll = () => {
    stats.refetch();
    normalized.refetch();
    raw.refetch();
  };

  const isEmpty = (stats.data?.raw_count ?? 0) === 0 && (stats.data?.catalog_count ?? 0) === 0;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Pricing v2 — Catalog Data
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse the Kroger catalog rows persisted by the bootstrap stage.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} className="gap-1.5">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Database className="w-4 h-4" />}
          label="Raw Kroger rows"
          value={stats.data?.raw_count ?? "—"}
          hint="pricing_v2_kroger_catalog_raw"
        />
        <StatCard
          icon={<Boxes className="w-4 h-4" />}
          label="Normalized catalog"
          value={stats.data?.catalog_count ?? "—"}
          hint="pricing_v2_item_catalog"
        />
        <StatCard
          icon={<Boxes className="w-4 h-4 text-success" />}
          label="Inventory mapped"
          value={stats.data?.inventory_mapped ?? "—"}
          hint="has kroger_product_id"
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
          label="Inventory unmapped"
          value={stats.data?.inventory_unmapped ?? "—"}
          hint="needs UPC mapping"
        />
      </div>

      {isEmpty && (
        <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="font-medium">No catalog data yet.</p>
                <p className="text-muted-foreground">
                  The catalog tables are empty because no inventory items have a Kroger UPC mapped,
                  so the bootstrap had nothing to fetch. Use{" "}
                  <Link to="/admin/pricing-v2/search" className="underline font-medium">
                    Kroger Search
                  </Link>{" "}
                  to find products and map them, then re-run{" "}
                  <Link to="/admin/pricing-v2/catalog" className="underline font-medium">
                    Catalog Bootstrap
                  </Link>
                  .
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex gap-2 items-center">
            <Input
              placeholder="Search by name, UPC, or brand…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" size="sm">Search</Button>
            {activeSearch && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setActiveSearch("");
                }}
              >
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Tabs defaultValue="normalized">
        <TabsList>
          <TabsTrigger value="normalized">
            Normalized ({normalized.data?.rows.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="raw">
            Raw payloads ({raw.data?.rows.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="normalized">
          <div className="flex justify-end mb-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={(normalized.data?.rows.length ?? 0) === 0}
              onClick={() =>
                downloadCsv(
                  `pv2-item-catalog-${stamp()}.csv`,
                  NORMALIZED_COLS,
                  normalized.data?.rows ?? [],
                )
              }
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {normalized.isLoading ? (
                <p className="p-4 text-sm text-muted-foreground">Loading…</p>
              ) : (normalized.data?.rows.length ?? 0) === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No rows.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">UPC</th>
                        <th className="text-left px-3 py-2">Name</th>
                        <th className="text-left px-3 py-2">Brand</th>
                        <th className="text-left px-3 py-2">Size</th>
                        <th className="text-right px-3 py-2">Net (g)</th>
                        <th className="text-left px-3 py-2">Source</th>
                        <th className="text-left px-3 py-2">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {normalized.data!.rows.map((r: any) => (
                        <tr key={r.id} className="border-t border-border/40">
                          <td className="px-3 py-2 font-mono text-xs">{r.upc ?? "—"}</td>
                          <td className="px-3 py-2">{r.name ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.brand ?? "—"}</td>
                          <td className="px-3 py-2 text-xs">{r.size_raw ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {r.net_weight_grams != null ? Number(r.net_weight_grams).toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {r.weight_source ? (
                              <Badge variant="outline" className="text-[10px]">{r.weight_source}</Badge>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw">
          <Card>
            <CardContent className="p-0">
              {raw.isLoading ? (
                <p className="p-4 text-sm text-muted-foreground">Loading…</p>
              ) : (raw.data?.rows.length ?? 0) === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No raw payloads.</p>
              ) : (
                <RawList rows={raw.data!.rows} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          {icon} {label}
        </div>
        <div className="font-display text-2xl font-bold">{value}</div>
        {hint && <div className="text-[10px] font-mono text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function RawList({ rows }: { rows: any[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="divide-y divide-border/40">
      {rows.map((r) => (
        <div key={r.id} className="p-3">
          <button
            onClick={() => setOpen((o) => (o === r.id ? null : r.id))}
            className="w-full flex items-start justify-between gap-3 text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{r.name ?? "(no name)"}</div>
              <div className="text-xs text-muted-foreground flex gap-3 mt-0.5 flex-wrap">
                <span className="font-mono">{r.upc ?? "—"}</span>
                {r.brand && <span>{r.brand}</span>}
                {r.size_raw && <span>{r.size_raw}</span>}
                <span>{new Date(r.fetched_at).toLocaleString()}</span>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {open === r.id ? "Hide" : "JSON"}
            </Badge>
          </button>
          {open === r.id && (
            <pre className="bg-muted/40 rounded-md p-3 text-xs overflow-x-auto mt-2 max-h-96">
              {JSON.stringify(r.payload_json ?? {}, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
