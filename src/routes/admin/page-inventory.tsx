import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  Camera,
  Check,
  AlertTriangle,
  ExternalLink,
  ImageOff,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { PageHelpCard } from "@/components/admin/PageHelpCard";
import { ROUTE_DESCRIPTIONS, type RouteAudience } from "@/lib/admin/page-descriptions";
import {
  syncRouteInventory,
  listRouteInventory,
  refreshRouteStatus,
  captureRouteThumbnail,
  setRouteReview,
  type RouteInventoryRow,
} from "@/lib/server-fns/route-inventory.functions";

export const Route = createFileRoute("/admin/page-inventory")({
  head: () => ({
    meta: [
      { title: "Page Inventory — Admin" },
      {
        name: "description",
        content:
          "Every route in the app, with HTTP reachability, last review, and thumbnail screenshots.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PageInventoryPage,
});

type Filter = "all" | "ok" | "broken" | "unreviewed" | "needs_review" | "no_thumb";

function statusTone(status: number | null): "ok" | "warn" | "bad" | "unknown" {
  if (status == null) return "unknown";
  if (status >= 200 && status < 400) return "ok";
  if (status >= 400 && status < 500) return "warn";
  return "bad";
}

function HttpBadge({ status }: { status: number | null }) {
  if (status == null)
    return (
      <Badge variant="outline" className="font-mono text-[10px]">
        —
      </Badge>
    );
  const tone = statusTone(status);
  const cls =
    tone === "ok"
      ? "bg-green-500/15 text-green-700 border-green-500/30"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
        : "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <Badge variant="outline" className={`font-mono text-[10px] ${cls}`}>
      {status}
    </Badge>
  );
}

function ReviewBadge({ status }: { status: RouteInventoryRow["review_status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    unreviewed: { label: "Unreviewed", cls: "bg-muted text-muted-foreground" },
    reviewed: {
      label: "Reviewed",
      cls: "bg-green-500/15 text-green-700 border-green-500/30",
    },
    needs_review: {
      label: "Needs review",
      cls: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    },
    broken: { label: "Broken", cls: "bg-destructive/15 text-destructive" },
  };
  const m = map[status] ?? map.unreviewed;
  return (
    <Badge variant="outline" className={`text-[10px] ${m.cls}`}>
      {m.label}
    </Badge>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function PageInventoryPage() {
  const sync = useServerFn(syncRouteInventory);
  const list = useServerFn(listRouteInventory);
  const refresh = useServerFn(refreshRouteStatus);
  const capture = useServerFn(captureRouteThumbnail);
  const review = useServerFn(setRouteReview);

  const [rows, setRows] = useState<RouteInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAll, setBusyAll] = useState<null | "refresh" | "thumbs">(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [audience, setAudience] = useState<"all" | RouteAudience>("all");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancelRef = useRef(false);

  async function reload() {
    try {
      const data = await list();
      setRows(data);
    } catch (e: any) {
      toast.error(e.message || "Failed to load inventory");
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await sync({ data: undefined as any });
        if (cancelled) return;
        await reload();
      } catch (e: any) {
        toast.error(e.message || "Failed to sync inventory");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const merged = useMemo(() => {
    return rows.map((r) => {
      const desc = ROUTE_DESCRIPTIONS[r.route_path];
      return {
        ...r,
        title: desc?.title ?? r.route_path,
        purpose: desc?.purpose ?? "",
        audience: desc?.audience ?? ("system" as RouteAudience),
      };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merged.filter((r) => {
      if (audience !== "all" && r.audience !== audience) return false;
      if (q && !`${r.route_path} ${r.title} ${r.purpose}`.toLowerCase().includes(q))
        return false;
      const tone = statusTone(r.last_http_status);
      switch (filter) {
        case "ok":
          return tone === "ok";
        case "broken":
          return tone === "bad" || tone === "warn" || r.review_status === "broken";
        case "unreviewed":
          return r.review_status === "unreviewed";
        case "needs_review":
          return r.review_status === "needs_review";
        case "no_thumb":
          return !r.thumbnail_url;
        default:
          return true;
      }
    });
  }, [merged, filter, search, audience]);

  const stats = useMemo(() => {
    const total = merged.length;
    const ok = merged.filter((r) => statusTone(r.last_http_status) === "ok").length;
    const broken = merged.filter(
      (r) => statusTone(r.last_http_status) === "bad" || r.review_status === "broken",
    ).length;
    const unreviewed = merged.filter((r) => r.review_status === "unreviewed").length;
    const withThumbs = merged.filter((r) => !!r.thumbnail_url).length;
    return { total, ok, broken, unreviewed, withThumbs };
  }, [merged]);

  async function handleRefreshAll() {
    setBusyAll("refresh");
    try {
      const res: any = await refresh({ data: {} });
      toast.success(
        `Checked ${res.checked} routes — ${res.healthy} healthy, ${res.broken} broken (${res.skipped} skipped).`,
      );
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Refresh failed");
    } finally {
      setBusyAll(null);
    }
  }

  async function handleCaptureOne(path: string) {
    setBusyRow(path);
    try {
      const res: any = await capture({ data: { path } });
      if (res?.ok) toast.success(`Captured ${path}`);
      else toast.warning(res?.message || `Could not capture ${path}`);
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Capture failed");
    } finally {
      setBusyRow(null);
    }
  }

  async function handleCaptureMissing() {
    cancelRef.current = false;
    const targets = merged
      .filter((r) => !r.thumbnail_url && r.audience !== "admin" && r.audience !== "auth")
      .filter((r) => !r.route_path.startsWith("/api") && !r.route_path.includes("$"))
      .map((r) => r.route_path);

    if (targets.length === 0) {
      toast.info("No public routes are missing a thumbnail.");
      return;
    }

    setBusyAll("thumbs");
    setProgress({ done: 0, total: targets.length });
    let success = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break;
      const path = targets[i];
      try {
        const res: any = await capture({ data: { path } });
        if (res?.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: targets.length });
      // gentle throttle so we don't hammer the screenshot API
      await new Promise((r) => setTimeout(r, 600));
    }
    setProgress(null);
    setBusyAll(null);
    toast.success(`Thumbnails: ${success} captured, ${failed} failed.`);
    await reload();
  }

  async function handleReview(
    path: string,
    next: RouteInventoryRow["review_status"],
  ) {
    try {
      await review({ data: { path, review_status: next } });
      setRows((prev) =>
        prev.map((r) =>
          r.route_path === path
            ? {
                ...r,
                review_status: next,
                reviewed_at: new Date().toISOString(),
              }
            : r,
        ),
      );
    } catch (e: any) {
      toast.error(e.message || "Could not save review");
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading page inventory…
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHelpCard route="/admin/page-inventory" />

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Page Inventory
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every route in the app — what it does, when it was last checked, and a
            thumbnail when one is available.
          </p>
        </div>
        <Link
          to="/admin/exports"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Exports
        </Link>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Total routes", value: stats.total },
          { label: "Healthy (2xx/3xx)", value: stats.ok },
          { label: "Broken / errors", value: stats.broken },
          { label: "Unreviewed", value: stats.unreviewed },
          { label: "With thumbnail", value: stats.withThumbs },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-xl font-semibold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Search</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Path, title, or purpose…"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Audience</label>
            <Select value={audience} onValueChange={(v) => setAudience(v as any)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="auth">Auth</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Filter</label>
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All routes</SelectItem>
                <SelectItem value="ok">Healthy only</SelectItem>
                <SelectItem value="broken">Broken / errors</SelectItem>
                <SelectItem value="unreviewed">Unreviewed</SelectItem>
                <SelectItem value="needs_review">Needs review</SelectItem>
                <SelectItem value="no_thumb">Missing thumbnail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 ml-auto">
            <Button
              onClick={handleRefreshAll}
              disabled={!!busyAll}
              variant="outline"
              className="gap-2"
            >
              {busyAll === "refresh" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Re-check all URLs
            </Button>
            <Button
              onClick={handleCaptureMissing}
              disabled={!!busyAll}
              className="gap-2"
            >
              {busyAll === "thumbs" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
              Capture missing thumbnails
            </Button>
          </div>
          {progress && (
            <div className="w-full text-xs text-muted-foreground">
              Capturing {progress.done} / {progress.total}…{" "}
              <button
                className="underline ml-2"
                onClick={() => {
                  cancelRef.current = true;
                }}
              >
                cancel
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">
            {filtered.length} of {merged.length} routes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left p-2 w-[160px]">Thumbnail</th>
                <th className="text-left p-2">Route</th>
                <th className="text-left p-2 w-[80px]">HTTP</th>
                <th className="text-left p-2 w-[120px]">Last checked</th>
                <th className="text-left p-2 w-[140px]">Review</th>
                <th className="text-right p-2 w-[160px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.route_path} className="border-t border-border/40">
                  <td className="p-2 align-top">
                    {r.thumbnail_url ? (
                      <a
                        href={r.thumbnail_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-[150px] aspect-[16/10] overflow-hidden rounded border border-border/60 bg-muted"
                      >
                        <img
                          src={r.thumbnail_url}
                          alt={`Thumbnail of ${r.route_path}`}
                          loading="lazy"
                          className="w-full h-full object-cover object-top"
                        />
                      </a>
                    ) : (
                      <div className="w-[150px] aspect-[16/10] rounded border border-dashed border-border/60 bg-muted/40 flex flex-col items-center justify-center text-muted-foreground text-[10px] gap-1">
                        <ImageOff className="w-4 h-4" />
                        {r.thumbnail_error ? "skipped" : "no thumb"}
                      </div>
                    )}
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs font-mono text-foreground">
                        {r.route_path}
                      </code>
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {r.audience}
                      </Badge>
                    </div>
                    <div className="text-foreground text-sm font-medium mt-1">
                      {r.title}
                    </div>
                    {r.purpose && (
                      <div className="text-muted-foreground text-xs mt-0.5 max-w-prose">
                        {r.purpose}
                      </div>
                    )}
                    {r.last_http_error && (
                      <div className="text-destructive text-xs mt-1 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {r.last_http_error}
                      </div>
                    )}
                  </td>
                  <td className="p-2 align-top">
                    <HttpBadge status={r.last_http_status} />
                  </td>
                  <td className="p-2 align-top text-xs text-muted-foreground">
                    {relativeTime(r.last_http_checked_at)}
                  </td>
                  <td className="p-2 align-top">
                    <Select
                      value={r.review_status}
                      onValueChange={(v) =>
                        handleReview(r.route_path, v as RouteInventoryRow["review_status"])
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue>
                          <ReviewBadge status={r.review_status} />
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unreviewed">Unreviewed</SelectItem>
                        <SelectItem value="reviewed">Reviewed</SelectItem>
                        <SelectItem value="needs_review">Needs review</SelectItem>
                        <SelectItem value="broken">Broken</SelectItem>
                      </SelectContent>
                    </Select>
                    {r.reviewed_at && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {relativeTime(r.reviewed_at)}
                      </div>
                    )}
                  </td>
                  <td className="p-2 align-top text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        disabled={busyRow === r.route_path}
                        onClick={() => handleCaptureOne(r.route_path)}
                        title="Re-capture thumbnail"
                      >
                        {busyRow === r.route_path ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Camera className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <a
                        href={r.route_path.replace(/\[\.]/g, ".")}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                        title="Open route in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">
                    No routes match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Check className="inline w-3 h-3 mr-1" />
        Thumbnails are captured by an external screenshot service against the
        published site. Admin, employee, dynamic, and API routes are skipped
        because they require auth or path parameters.
      </p>
    </div>
  );
}
