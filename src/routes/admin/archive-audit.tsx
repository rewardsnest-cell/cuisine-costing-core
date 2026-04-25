import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RefreshCw, Database, FileCode2 } from "lucide-react";
import { LegacyArchivedBanner } from "@/components/admin/LegacyArchivedBanner";
import {
  scanLegacyReferences,
  listArchiveObjects,
  runRuntimeSmokeTest,
} from "@/lib/server-fns/archive-audit.functions";

export const Route = createFileRoute("/admin/archive-audit")({
  head: () => ({
    meta: [{ title: "Archive Audit — Pricing v1 Isolation" }],
  }),
  component: ArchiveAuditPage,
});

function ArchiveAuditPage() {
  const scan = useQuery({
    queryKey: ["archive-audit", "scan"],
    queryFn: () => scanLegacyReferences(),
  });
  const objects = useQuery({
    queryKey: ["archive-audit", "objects"],
    queryFn: () => listArchiveObjects(),
  });
  const smoke = useQuery({
    queryKey: ["archive-audit", "smoke"],
    queryFn: () => runRuntimeSmokeTest(),
  });

  const codePass = scan.data?.pass === true;
  const smokePass = smoke.data?.pass === true;
  const overallPass = codePass && smokePass;
  const overallReady =
    scan.data !== undefined && smoke.data !== undefined;

  const refetchAll = () => {
    scan.refetch();
    objects.refetch();
    smoke.refetch();
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <LegacyArchivedBanner />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Archive Audit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifies that no runtime code references Pricing v1 tables, and
            lists the archived database objects for reference.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll}>
          <RefreshCw className="w-4 h-4 mr-2" /> Re-run
        </Button>
      </div>

      {/* Overall status */}
      <Card className={overallPass ? "border-success/50" : "border-destructive/50"}>
        <CardContent className="p-5 flex items-center gap-4">
          {!overallReady ? (
            <Badge variant="secondary">Running…</Badge>
          ) : overallPass ? (
            <>
              <CheckCircle2 className="w-8 h-8 text-success" />
              <div>
                <div className="font-display text-xl font-bold text-success">
                  PASS
                </div>
                <div className="text-sm text-muted-foreground">
                  No legacy pricing references in code, and key screens load
                  cleanly.
                </div>
              </div>
            </>
          ) : (
            <>
              <XCircle className="w-8 h-8 text-destructive" />
              <div>
                <div className="font-display text-xl font-bold text-destructive">
                  FAIL
                </div>
                <div className="text-sm text-muted-foreground">
                  {!codePass && <>Code scan found legacy references. </>}
                  {!smokePass && <>Runtime smoke test failed. </>}
                  See details below.
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Code scan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode2 className="w-5 h-5" />
            Code references to legacy pricing
            {scan.data && (
              <Badge variant={codePass ? "default" : "destructive"} className="ml-auto">
                {codePass ? "PASS" : `${scan.data.matches.length} found`}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {scan.isLoading && <p className="text-sm text-muted-foreground">Scanning…</p>}
          {scan.error && (
            <p className="text-sm text-destructive">
              Scan error: {(scan.error as Error).message}
            </p>
          )}
          {scan.data && (
            <>
              <p className="text-xs text-muted-foreground">
                Scanned {scan.data.filesScanned} files for{" "}
                {scan.data.patterns.length} legacy patterns. Allowlisted
                files (docs, archived stubs, this audit page) are excluded.
              </p>
              {scan.data.matches.length === 0 ? (
                <p className="text-sm text-success flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  No active references — isolation verified.
                </p>
              ) : (
                <div className="border border-border/60 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">File</th>
                        <th className="text-left px-3 py-2">Line</th>
                        <th className="text-left px-3 py-2">Pattern</th>
                        <th className="text-left px-3 py-2">Excerpt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scan.data.matches.map((m, i) => (
                        <tr key={i} className="border-t border-border/40">
                          <td className="px-3 py-2 font-mono text-xs">{m.file}</td>
                          <td className="px-3 py-2 font-mono text-xs">{m.line}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline">{m.pattern}</Badge>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {m.excerpt}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Patterns checked</summary>
                <ul className="mt-2 grid grid-cols-2 gap-1 font-mono">
                  {scan.data.patterns.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      {/* Runtime smoke test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Runtime smoke test
            {smoke.data && (
              <Badge variant={smokePass ? "default" : "destructive"} className="ml-auto">
                {smokePass ? "PASS" : "FAIL"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {smoke.isLoading && <p className="text-sm text-muted-foreground">Probing…</p>}
          {smoke.error && (
            <p className="text-sm text-destructive">
              Smoke error: {(smoke.error as Error).message}
            </p>
          )}
          {smoke.data?.checks.map((c) => (
            <div key={c.name} className="flex items-start gap-2 text-sm">
              {c.ok ? (
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive mt-0.5" />
              )}
              <div>
                <div className="font-medium">{c.name}</div>
                {c.error && (
                  <div className="text-xs text-destructive font-mono">{c.error}</div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Archived DB objects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Archived database objects
            {objects.data && (
              <Badge variant="secondary" className="ml-auto">
                {objects.data.objects.length} object{objects.data.objects.length === 1 ? "" : "s"}
                {objects.data.source === "fallback" && " (static)"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {objects.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {objects.data && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm font-mono">
              {objects.data.objects.map((o) => (
                <li key={o.name} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {o.kind}
                  </Badge>
                  archive.{o.name}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
