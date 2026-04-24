import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { saveCookingLabEntry } from "@/lib/server-fns/save-cooking-lab-entry.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CookingLabSection, CookingLabPageBody, type CookingLabEntry as PublicCookingLabEntry } from "@/routes/cooking-lab";
import { withAmazonAffiliateTag, isTaggableAmazonUrl, autoFixAmazonUrl, extractAmazonAsin } from "@/lib/amazon-affiliate";
import {
  FlaskConical,
  Plus,
  Trash2,
  Save,
  Shield,
  ExternalLink,
  Megaphone,
  ListChecks,
  CalendarRange,
  BookOpen,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  DollarSign,
  Copy,
  Upload,
  Video as VideoIcon,
  Loader2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

type CookingLabEntry = {
  id: string;
  visible: boolean;
  status: "draft" | "published";
  title: string;
  description: string;
  video_url: string | null;
  image_url: string | null;
  primary_tool_name: string | null;
  primary_tool_url: string | null;
  secondary_tool_name: string | null;
  secondary_tool_url: string | null;
  display_order: number;
  qa_copy_reviewed: boolean;
  qa_video_loads: boolean;
  qa_image_loads: boolean;
  qa_links_tested: boolean;
  qa_ready: boolean;
};

type LinkCheck = {
  id: string;
  label: string;
  status: "ok" | "warning" | "error" | "empty";
  message: string;
};

/**
 * Affiliate tool slot registry — single source of truth for which tool fields
 * exist on a Cooking Lab entry, which are required to publish, and how each
 * pair (name + URL) is keyed on the entry record.
 *
 * To add a new optional tool link (e.g. tertiary), do TWO things:
 *   1. Add the columns `tertiary_tool_name` / `tertiary_tool_url` via a
 *      Supabase migration AND extend the `CookingLabEntry` type.
 *   2. Append `{ id: "tertiary", label: "Tertiary tool link",
 *      nameKey: "tertiary_tool_name", urlKey: "tertiary_tool_url",
 *      required: false }` to TOOL_SLOTS below.
 *
 * Both publish-gating (`computeToolFieldErrors`) and the live LinkChecksPanel
 * (`validateEntryLinks`) iterate this registry, so no other code changes are
 * needed — every new slot automatically gets:
 *   • inline per-field error messages,
 *   • LinkChecksPanel status row,
 *   • publish blocking when required (or when half-filled if optional).
 */
type ToolSlotKey =
  | "primary_tool_name" | "primary_tool_url"
  | "secondary_tool_name" | "secondary_tool_url";

type ToolSlot = {
  id: string;
  label: string;
  nameKey: Extract<ToolSlotKey, `${string}_tool_name`>;
  urlKey: Extract<ToolSlotKey, `${string}_tool_url`>;
  /** True = both name + URL must be filled to publish. False = optional, but if one side is filled the other becomes required. */
  required: boolean;
};

const TOOL_SLOTS: ToolSlot[] = [
  {
    id: "primary",
    label: "Primary tool link",
    nameKey: "primary_tool_name",
    urlKey: "primary_tool_url",
    required: true,
  },
  {
    id: "secondary",
    label: "Secondary tool link",
    nameKey: "secondary_tool_name",
    urlKey: "secondary_tool_url",
    required: false,
  },
];

/** Per-field publish-blocking errors keyed by the entry field name. */
export type ToolFieldErrors = Partial<Record<ToolSlotKey, string | null>>;

/**
 * Automated, synchronous validation of an entry's affiliate URLs.
 * Runs on every keystroke — no network calls (Amazon blocks CORS HEAD checks
 * from browsers, and a server probe would be slow + rate-limited). These
 * structural checks catch ~all real-world authoring mistakes: missing links,
 * shortener URLs, wrong host, malformed paths, missing product IDs.
 *
 * Iterates TOOL_SLOTS so additional optional tool slots are picked up
 * automatically.
 */
function validateEntryLinks(entry: CookingLabEntry): LinkCheck[] {
  return TOOL_SLOTS.map((slot) =>
    validateAmazonLink({
      id: slot.id,
      label: slot.label,
      name: (entry as any)[slot.nameKey] ?? null,
      url: (entry as any)[slot.urlKey] ?? null,
      required: slot.required,
    }),
  );
}

const AMAZON_HOSTS = [
  "amazon.com", "www.amazon.com", "smile.amazon.com",
  "amazon.co.uk", "www.amazon.co.uk",
  "amazon.ca", "www.amazon.ca",
  "amzn.to", // canonical Amazon short link — allowed but flagged as warning
];
const SHORTENER_HOSTS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly"];

function validateAmazonLink(args: {
  id: string;
  label: string;
  name: string | null;
  url: string | null;
  required: boolean;
}): LinkCheck {
  const { id, label, name, url, required } = args;
  const trimmedName = (name ?? "").trim();
  const trimmedUrl = (url ?? "").trim();

  // Both empty — only an error if required
  if (!trimmedName && !trimmedUrl) {
    return {
      id, label,
      status: required ? "error" : "empty",
      message: required ? "Required: add a tool name and Amazon URL." : "Not set (optional).",
    };
  }

  // Half-filled — name without URL or URL without name
  if (trimmedName && !trimmedUrl) {
    return { id, label, status: "error", message: `"${trimmedName}" has no Amazon URL.` };
  }
  if (!trimmedName && trimmedUrl) {
    return { id, label, status: "error", message: "URL is set but tool name is missing." };
  }

  // URL parse + scheme
  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    return { id, label, status: "error", message: "Not a valid URL (must start with https://)." };
  }
  if (parsed.protocol !== "https:") {
    return { id, label, status: "error", message: "URL must use https://." };
  }

  const host = parsed.hostname.toLowerCase();

  // Disallowed shorteners
  if (SHORTENER_HOSTS.some((h) => host === h || host.endsWith("." + h))) {
    return {
      id, label, status: "error",
      message: `Shorteners (${host}) are not allowed — use the full Amazon URL.`,
    };
  }

  // Wrong host
  const isAmazon = AMAZON_HOSTS.includes(host) || host.endsWith(".amazon.com");
  if (!isAmazon) {
    return { id, label, status: "error", message: `Host "${host}" is not an Amazon domain.` };
  }

  // amzn.to short link → warning, not block
  if (host === "amzn.to") {
    return {
      id, label, status: "warning",
      message: "amzn.to short link works but a full /dp/ URL is preferred for transparency.",
    };
  }

  // Amazon product URL must contain /dp/ASIN or /gp/product/ASIN
  const path = parsed.pathname;
  const asinMatch = path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  if (!asinMatch) {
    return {
      id, label, status: "error",
      message: "Amazon URL must contain /dp/ASIN or /gp/product/ASIN (10-char product ID).",
    };
  }

  return { id, label, status: "ok", message: `Valid Amazon link · ASIN ${asinMatch[1].toUpperCase()}` };
}

/**
 * Returns inline, publish-blocking errors per individual tool field, driven
 * by the TOOL_SLOTS registry. Adding a new slot to TOOL_SLOTS automatically
 * extends publish gating with no further changes here.
 *
 * Rules per slot:
 *  - required=true: both name + URL must be filled, URL must validate.
 *  - required=false: pair-required only if one side is filled; URL still
 *    must validate when present.
 */
function computeToolFieldErrors(entry: CookingLabEntry): ToolFieldErrors {
  const errors: ToolFieldErrors = {};

  for (const slot of TOOL_SLOTS) {
    const name = ((entry as any)[slot.nameKey] ?? "").trim();
    const url = ((entry as any)[slot.urlKey] ?? "").trim();

    if (slot.required) {
      if (!name) errors[slot.nameKey] = "Required — add the tool name shown to readers.";
      if (!url) {
        errors[slot.urlKey] = "Required — paste the full Amazon product URL.";
      } else {
        const check = validateAmazonLink({
          id: slot.id, label: slot.label, name: name || "x", url, required: true,
        });
        if (check.status === "error") errors[slot.urlKey] = check.message;
      }
    } else {
      // Optional pair — gate only if half-filled or URL malformed.
      if (name && !url) errors[slot.urlKey] = "Required — name is set, add the Amazon URL too.";
      if (!name && url) errors[slot.nameKey] = "Required — URL is set, add the tool name too.";
      if (url) {
        const check = validateAmazonLink({
          id: slot.id, label: slot.label, name: name || "x", url, required: false,
        });
        if (check.status === "error") errors[slot.urlKey] = check.message;
      }
    }
  }

  return errors;
}


function LinkChecksPanel({ checks }: { checks: LinkCheck[] }) {
  const errorCount = checks.filter((c) => c.status === "error").length;
  const warnCount = checks.filter((c) => c.status === "warning").length;
  const okCount = checks.filter((c) => c.status === "ok").length;

  let panelTone = "border-border bg-muted/20";
  if (errorCount > 0) panelTone = "border-destructive/40 bg-destructive/5";
  else if (warnCount > 0) panelTone = "border-amber-500/40 bg-amber-500/5";
  else if (okCount > 0) panelTone = "border-emerald-500/30 bg-emerald-500/5";

  return (
    <div className={`mt-3 rounded-md border p-3 space-y-2 ${panelTone}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <ListChecks className="w-3.5 h-3.5" />
        Automated link checks
        <span className="text-muted-foreground font-normal">
          · {okCount} ok · {warnCount} warning · {errorCount} error
        </span>
      </div>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            {c.status === "ok" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />}
            {c.status === "error" && <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />}
            {c.status === "warning" && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />}
            {c.status === "empty" && <span className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />}
            <div>
              <span className="font-medium text-foreground">{c.label}:</span>{" "}
              <span className="text-muted-foreground">{c.message}</span>
            </div>
          </li>
        ))}
      </ul>
      {errorCount > 0 && (
        <p className="text-[11px] text-destructive pt-1 border-t border-destructive/20">
          Publishing is blocked until all errors are resolved.
        </p>
      )}
    </div>
  );
}

/**
 * Shows the actual outbound URL each tool link will produce — with the
 * configured Amazon associate tag injected. Editors can copy and test it
 * to confirm Amazon attributes the click to the right account.
 */
function TaggedLinkPreview({
  primaryName,
  primaryUrl,
  secondaryName,
  secondaryUrl,
}: {
  primaryName: string | null;
  primaryUrl: string | null;
  secondaryName: string | null;
  secondaryUrl: string | null;
}) {
  const { data: tag } = useAmazonAssociateTagAdmin();
  const items = [
    { name: primaryName, url: primaryUrl, label: "Primary" },
    { name: secondaryName, url: secondaryUrl, label: "Secondary" },
  ].filter((i) => i.url && i.name && isTaggableAmazonUrl(i.url));

  if (items.length === 0) return null;

  const tagSet = !!(tag && tag.trim());

  return (
    <div className="mt-3 rounded-md border border-border bg-background p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <DollarSign className="w-3.5 h-3.5" />
        Tracking-tagged outbound URLs
        {!tagSet && (
          <span className="text-amber-600 dark:text-amber-400 font-normal">
            · No tag set — set it in Amazon Affiliate Tag card below
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {items.map((i) => {
          const tagged = withAmazonAffiliateTag(i.url!, tag ?? null);
          return (
            <li key={i.label} className="text-xs">
              <p className="text-muted-foreground mb-0.5">
                <span className="font-medium text-foreground">{i.label}:</span> {i.name}
              </p>
              <div className="flex items-center gap-1.5">
                <code className="block break-all text-[11px] text-foreground bg-muted p-2 rounded flex-1">
                  {tagged}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  title="Copy tagged URL"
                  onClick={() => {
                    navigator.clipboard.writeText(tagged).then(
                      () => toast.success("Tagged URL copied"),
                      () => toast.error("Could not copy"),
                    );
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Amazon URL input with a one-click "Auto-fix" button. Converts common
 * non-canonical Amazon URL shapes (gp/product, exec/obidos, m. subdomain,
 * smile., asin=… query, http://) into the clean `https://www.amazon.com/dp/ASIN`
 * form. Disabled when the URL is empty or already canonical/un-fixable.
 */
function AmazonUrlInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const trimmed = value.trim();
  const preview = trimmed ? autoFixAmazonUrl(trimmed) : null;
  const canFix = !!preview && preview.changed;
  const asin = extractAmazonAsin(trimmed);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://www.amazon.com/dp/ASIN"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canFix}
          title={preview ? preview.reason : "Paste an Amazon URL to enable auto-fix"}
          onClick={() => {
            if (!preview) return;
            if (preview.changed) {
              onChange(preview.url);
              toast.success("URL auto-fixed", { description: preview.reason });
            } else {
              toast.info("Nothing to fix", { description: preview.reason });
            }
          }}
        >
          Auto-fix
        </Button>
      </div>
      {asin && (
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(asin).then(
              () => toast.success(`ASIN ${asin} copied`),
              () => toast.error("Could not copy ASIN"),
            );
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted px-2 py-0.5 text-[11px] font-mono text-foreground transition-colors"
          title="Click to copy ASIN to clipboard"
        >
          ASIN: <span className="font-semibold">{asin}</span>
          <Copy className="w-3 h-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

export const Route = createFileRoute("/admin/cooking-lab")({
  head: () => ({
    meta: [
      { title: "Cooking Lab — Content Manager" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CookingLabAdminPage,
});

function useIsMarketing(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      const roles = (data ?? []).map((r: any) => r.role as string);
      return roles.includes("marketing") || roles.includes("admin");
    },
  });
}

function CookingLabAdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const { data: canManage, isLoading: rolesLoading } = useIsMarketing(user?.id);

  if (loading || rolesLoading) {
    return <LoadingState fullScreen label="Checking access…" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4">
        <div className="text-center max-w-sm">
          <Shield className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h1 className="font-display text-xl font-semibold">Sign in required</h1>
          <p className="text-sm text-muted-foreground mt-2">
            You need to sign in to manage Cooking Lab content.
          </p>
        </div>
      </div>
    );
  }

  if (!canManage && !isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4">
        <div className="text-center max-w-sm">
          <Shield className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h1 className="font-display text-xl font-semibold">Marketing access required</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Only users with the Marketing or Admin role can manage Cooking Lab content.
          </p>
        </div>
      </div>
    );
  }

  return <CookingLabManager />;
}

function FullPagePreviewButton({ entries }: { entries: CookingLabEntry[] }) {
  const [open, setOpen] = useState(false);
  const [includeDrafts, setIncludeDrafts] = useState(false);

  // Mirror the public page's filter (visible + published), then optionally
  // layer drafts on top so admins can see exactly what publishing will reveal.
  const publishedVisible = entries
    .filter((e) => e.visible && e.status === "published")
    .sort((a, b) => a.display_order - b.display_order);
  const draftsVisible = entries
    .filter((e) => e.visible && e.status === "draft")
    .sort((a, b) => a.display_order - b.display_order);

  const previewEntries: PublicCookingLabEntry[] = (
    includeDrafts ? [...publishedVisible, ...draftsVisible] : publishedVisible
  ).map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    video_url: e.video_url,
    image_url: e.image_url,
    primary_tool_name: e.primary_tool_name,
    primary_tool_url: e.primary_tool_url,
    secondary_tool_name: e.secondary_tool_name,
    secondary_tool_url: e.secondary_tool_url,
    display_order: e.display_order,
  }));

  const draftCount = draftsVisible.length;
  const hiddenCount = entries.filter((e) => !e.visible).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Eye className="w-4 h-4" />
          Preview full page
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-7xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/30 sticky top-0 z-10">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Public preview — /cooking-lab
          </DialogTitle>
          <DialogDescription>
            Read-only replica of the live page. Reflects <strong>saved</strong> data only —
            unsaved edits in any entry card below are not shown here.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5">
              <Switch
                id="include-drafts"
                checked={includeDrafts}
                onCheckedChange={setIncludeDrafts}
              />
              <Label htmlFor="include-drafts" className="text-sm cursor-pointer">
                Include drafts ({draftCount})
              </Label>
            </div>
            <Badge variant="secondary" className="gap-1">
              {previewEntries.length} entries shown
            </Badge>
            {hiddenCount > 0 && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                {hiddenCount} hidden (excluded)
              </Badge>
            )}
            {includeDrafts && draftCount > 0 && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                Showing what visitors will see <em className="not-italic">after</em> publishing
              </Badge>
            )}
          </div>
        </DialogHeader>
        <div className="bg-background">
          {/* Disable interactivity so admin can't accidentally click outbound affiliate
              links from the preview (would skew analytics). */}
          <div className="pointer-events-none select-none">
            <CookingLabPageBody entries={previewEntries} isLoading={false} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CookingLabManager() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const { data: entries, isLoading } = useQuery({
    queryKey: ["cooking-lab", "admin"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cooking_lab_entries")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CookingLabEntry[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const nextOrder = (entries ?? []).reduce((m, e) => Math.max(m, e.display_order), 0) + 1;
      const { error } = await (supabase as any).from("cooking_lab_entries").insert({
        title: "New Technique",
        description: "",
        display_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cooking-lab"] });
      toast.success("New entry created");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create entry"),
  });

  // Swap display_order between two entries — atomic from the user's POV.
  // We persist whatever display_order each entry has, then re-sort client-side
  // on next fetch. Two writes; both must succeed for the visible reorder.
  const reorderMut = useMutation({
    mutationFn: async ({ a, b }: { a: CookingLabEntry; b: CookingLabEntry }) => {
      const { error: e1 } = await (supabase as any)
        .from("cooking_lab_entries")
        .update({ display_order: b.display_order })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any)
        .from("cooking_lab_entries")
        .update({ display_order: a.display_order })
        .eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cooking-lab"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Reorder failed"),
  });

  const sorted = (entries ?? []).slice().sort((a, b) => a.display_order - b.display_order);
  const moveEntry = (idx: number, dir: -1 | 1) => {
    const a = sorted[idx];
    const b = sorted[idx + dir];
    if (!a || !b) return;
    // If both share the same display_order (legacy data), nudge b up by 1 first.
    if (a.display_order === b.display_order) {
      reorderMut.mutate({
        a,
        b: { ...b, display_order: b.display_order + (dir === 1 ? 1 : -1) },
      });
    } else {
      reorderMut.mutate({ a, b });
    }
  };

  // Bulk delete selected entries.
  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase as any)
        .from("cooking_lab_entries")
        .delete()
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["cooking-lab"] });
      setSelectedIds(new Set());
      toast.success(`Deleted ${count} ${count === 1 ? "entry" : "entries"}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk delete failed"),
  });

  // Bulk duplicate: clone each selected entry as a draft, hidden, with a new
  // display_order appended after the current max. Tool/QA fields and other
  // editable content are copied so editors only need to tweak titles.
  const bulkDuplicateMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const all = entries ?? [];
      const selected = all.filter((e) => ids.includes(e.id));
      if (selected.length === 0) return 0;
      let nextOrder = all.reduce((m, e) => Math.max(m, e.display_order), 0) + 1;
      const rows = selected
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .map((e) => ({
          title: `${e.title} (copy)`,
          description: e.description,
          video_url: e.video_url,
          image_url: e.image_url,
          primary_tool_name: e.primary_tool_name,
          primary_tool_url: e.primary_tool_url,
          secondary_tool_name: e.secondary_tool_name,
          secondary_tool_url: e.secondary_tool_url,
          status: "draft" as const,
          visible: false,
          qa_copy_reviewed: false,
          qa_video_loads: false,
          qa_image_loads: false,
          qa_links_tested: false,
          qa_ready: false,
          display_order: nextOrder++,
        }));
      const { error } = await (supabase as any)
        .from("cooking_lab_entries")
        .insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["cooking-lab"] });
      setSelectedIds(new Set());
      toast.success(`Duplicated ${count} ${count === 1 ? "entry" : "entries"} as drafts`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk duplicate failed"),
  });

  const allSorted = (entries ?? []).slice().sort((a, b) => a.display_order - b.display_order);
  const allSelected = allSorted.length > 0 && allSorted.every((e) => selectedIds.has(e.id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allSorted.map((e) => e.id)));
  };
  const bulkBusy = bulkDeleteMut.isPending || bulkDuplicateMut.isPending;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 bg-background min-h-screen">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center">
            <FlaskConical className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Cooking Lab — Content Manager
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          This page controls everything that appears on the public{" "}
          <a href="/cooking-lab" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
            /cooking-lab <ExternalLink className="w-3 h-3" />
          </a>{" "}
          page.
        </p>
      </div>

      {/* Reminder */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-foreground">
            <strong>Do not edit public pages directly.</strong> All Cooking Lab updates happen here.
          </p>
        </CardContent>
      </Card>

      {/* New entry + full-page preview */}
      <div className="flex justify-end gap-2">
        <FullPagePreviewButton entries={entries ?? []} />
        <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="gap-2">
          <Plus className="w-4 h-4" />
          New Entry
        </Button>
      </div>

      {/* Entries */}
      {isLoading ? (
        <LoadingState label="Loading entries…" />
      ) : !entries || entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No entries yet. Click <strong>New Entry</strong> to add one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Bulk action toolbar */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all entries"
              />
              <span className="text-muted-foreground">
                {selectedIds.size > 0
                  ? `${selectedIds.size} selected`
                  : `Select all (${allSorted.length})`}
              </span>
            </label>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => bulkDuplicateMut.mutate(Array.from(selectedIds))}
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => {
                const ids = Array.from(selectedIds);
                if (ids.length === 0) return;
                if (confirm(`Delete ${ids.length} ${ids.length === 1 ? "entry" : "entries"}? This cannot be undone.`)) {
                  bulkDeleteMut.mutate(ids);
                }
              }}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>

          <div className="space-y-6">
            {allSorted.map((e, idx) => (
              <EntryCard
                key={e.id}
                entry={e}
                canMoveUp={idx > 0}
                canMoveDown={idx < allSorted.length - 1}
                onMoveUp={() => moveEntry(idx, -1)}
                onMoveDown={() => moveEntry(idx, 1)}
                reordering={reorderMut.isPending}
                selected={selectedIds.has(e.id)}
                onToggleSelected={(checked) => toggleSelected(e.id, checked)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Affiliate config — applies to all entries */}
      <AffiliateConfigCard />

      {/* Editorial guidance */}
      <EditorialGuidance />
      <BrandVoiceCard />
      <OperatorSOPCard />
      <QAChecklistCard />
      <RoadmapCard />
    </div>
  );
}

function useAmazonAssociateTagAdmin() {
  return useQuery({
    queryKey: ["amazon-associate-tag"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("app_kv")
        .select("value")
        .eq("key", "amazon_associate_tag")
        .maybeSingle();
      return ((data?.value as string | null) ?? "").trim() || null;
    },
  });
}

function AffiliateConfigCard() {
  const queryClient = useQueryClient();
  const { data: currentTag, isLoading } = useAmazonAssociateTagAdmin();
  const [tag, setTag] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTag(currentTag ?? "");
    setDirty(false);
  }, [currentTag]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const trimmed = tag.trim();
      // Basic shape check — Amazon associate tags are typically "name-XX".
      if (trimmed && !/^[a-z0-9][a-z0-9-]{2,29}$/i.test(trimmed)) {
        throw new Error("Tag should be 3–30 chars, letters/numbers/hyphens (e.g. vpsfinest-20).");
      }
      const { error } = await (supabase as any)
        .from("app_kv")
        .upsert({ key: "amazon_associate_tag", value: trimmed }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["amazon-associate-tag"] });
      setDirty(false);
      toast.success("Affiliate tag saved — all outbound links updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const sampleUrl = "https://www.amazon.com/dp/B00FLYWNYQ";
  const taggedSample = withAmazonAffiliateTag(sampleUrl, tag.trim() || null);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Amazon Affiliate Tag (Global)
        </CardTitle>
        <CardDescription>
          One tag applies to every Cooking Lab tool link. Editors paste clean Amazon URLs;
          the tag is appended automatically at render time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field
          label="Associate tag"
          hint="From Amazon Associates Central → Account Settings. Example: vpsfinest-20"
        >
          <Input
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setDirty(true);
            }}
            placeholder="vpsfinest-20"
            disabled={isLoading}
          />
        </Field>
        <div className="rounded-md border border-border bg-background p-3 text-xs space-y-1.5">
          <p className="font-medium text-foreground">Live preview</p>
          <p className="text-muted-foreground">Sample URL → outbound link:</p>
          <code className="block break-all text-[11px] text-foreground bg-muted p-2 rounded">
            {taggedSample || "(set a tag to see preview)"}
          </code>
          {!tag.trim() && (
            <p className="text-amber-600 dark:text-amber-400">
              ⚠ No tag set — outbound links will NOT earn commissions.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400 self-center">Unsaved</span>}
          <Button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending} className="gap-2">
            <Save className="w-4 h-4" />
            {saveMut.isPending ? "Saving…" : "Save tag"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EntryCard({
  entry,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  reordering,
  selected,
  onToggleSelected,
}: {
  entry: CookingLabEntry;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reordering: boolean;
  selected: boolean;
  onToggleSelected: (checked: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CookingLabEntry>(entry);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(entry);
    setDirty(false);
  }, [entry]);

  const update = <K extends keyof CookingLabEntry>(key: K, value: CookingLabEntry[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  const linkChecks = validateEntryLinks(draft);
  const linksAllPassed = linkChecks.every((c) => c.status === "ok");
  const linksHaveErrors = linkChecks.some((c) => c.status === "error");

  const qaItems = [
    draft.qa_copy_reviewed,
    draft.qa_video_loads,
    draft.qa_image_loads,
    draft.qa_links_tested,
    draft.qa_ready,
  ];
  const qaPassedCount = qaItems.filter(Boolean).length;
  const qaAllPassed = qaPassedCount === qaItems.length;
  const wantsPublished = draft.status === "published";
  const publishBlocked = wantsPublished && (!qaAllPassed || !linksAllPassed);

  // Save goes through the server function `saveCookingLabEntry`, which re-runs
  // `validateCookingLabEntryForPublish` server-side. The client publish gate
  // below is for UX only — the server is the source of truth and will reject
  // any tampered request that tries to publish an invalid entry.
  const saveCookingLabEntryFn = useServerFn(saveCookingLabEntry);
  const saveMut = useMutation({
    mutationFn: async () => {
      if (publishBlocked) {
        if (!qaAllPassed) {
          throw new Error("Complete all 5 QA checklist items before publishing.");
        }
        throw new Error("Fix all link validation errors before publishing.");
      }
      await saveCookingLabEntryFn({ data: draft });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cooking-lab"] });
      setDirty(false);
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("cooking_lab_entries")
        .delete()
        .eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cooking-lab"] });
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  // Per-field publish-blocking errors for the Tools section.
  // Mirrors validateAmazonLink so the Field-level error and the LinkChecksPanel agree.
  const toolFieldErrors = computeToolFieldErrors(draft);

  return (
    <Card>
      <CardHeader className="border-b border-border bg-muted/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{draft.title || "(untitled)"}</CardTitle>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant={draft.status === "published" ? "default" : "secondary"}>
                {draft.status}
              </Badge>
              <Badge variant={draft.visible ? "default" : "outline"}>
                {draft.visible ? "Shown" : "Hidden"}
              </Badge>
              <span className="text-xs text-muted-foreground">Order #{draft.display_order}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex items-center mr-1 rounded-md border border-border">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-r-none"
                title="Move up"
                disabled={!canMoveUp || reordering}
                onClick={onMoveUp}
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-l-none border-l border-border"
                title="Move down"
                disabled={!canMoveDown || reordering}
                onClick={onMoveDown}
              >
                <ArrowDown className="w-4 h-4" />
              </Button>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Eye className="w-4 h-4" />
                  Preview public card
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Public preview — {draft.title || "(untitled)"}</DialogTitle>
                  <DialogDescription>
                    This is exactly how the card renders on /cooking-lab when published & visible.
                    Reflects your unsaved edits.
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-lg border border-border bg-background p-6 mt-2">
                  <CookingLabSection entry={draft} reverse={false} />
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(`Delete "${entry.title}"? This cannot be undone.`)) {
                  deleteMut.mutate();
                }
              }}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* A. Visibility & Basics */}
        <Section label="A. Visibility & Basics">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label className="text-sm font-medium">Show in Cooking Lab</Label>
              <p className="text-xs text-muted-foreground">
                Must be ON and Status = Published to appear publicly.
              </p>
            </div>
            <Switch
              checked={draft.visible}
              onCheckedChange={(v) => update("visible", v)}
            />
          </div>
          <Field label="Title">
            <Input value={draft.title} onChange={(e) => update("title", e.target.value)} />
          </Field>
          <Field label="One-sentence description" hint="Keep it concise — one sentence is the goal.">
            <Textarea
              rows={2}
              value={draft.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </Field>
        </Section>

        {/* B. Video */}
        <Section label="B. Video">
          <VideoUploader
            currentUrl={draft.video_url}
            entryId={draft.id}
            onUploaded={(url) => update("video_url", url)}
          />
          <Field label="Video URL" hint="Paste a YouTube URL, or upload an MP4/WebM above. Replace later with on-camera footage.">
            <Input
              value={draft.video_url ?? ""}
              onChange={(e) => update("video_url", e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... or uploaded video URL"
            />
          </Field>
        </Section>

        {/* C. Image */}
        <Section label="C. Image">
          <Field label="Image URL" hint="Use approved brand assets only.">
            <Input
              value={draft.image_url ?? ""}
              onChange={(e) => update("image_url", e.target.value)}
              placeholder="https://..."
            />
          </Field>
        </Section>

        {/* D. Tools */}
        <Section label="D. Tools & Affiliate Links" hint="Use full Amazon URLs only (no shorteners).">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Primary Tool Name" error={toolFieldErrors.primary_tool_name}>
              <Input
                value={draft.primary_tool_name ?? ""}
                onChange={(e) => update("primary_tool_name", e.target.value)}
              />
            </Field>
            <Field label="Primary Amazon Link" error={toolFieldErrors.primary_tool_url}>
              <AmazonUrlInput
                value={draft.primary_tool_url ?? ""}
                onChange={(v) => update("primary_tool_url", v)}
              />
            </Field>
            <Field label="Secondary Tool Name" error={toolFieldErrors.secondary_tool_name}>
              <Input
                value={draft.secondary_tool_name ?? ""}
                onChange={(e) => update("secondary_tool_name", e.target.value)}
              />
            </Field>
            <Field label="Secondary Amazon Link" error={toolFieldErrors.secondary_tool_url}>
              <AmazonUrlInput
                value={draft.secondary_tool_url ?? ""}
                onChange={(v) => update("secondary_tool_url", v)}
              />
            </Field>
          </div>
          <LinkChecksPanel checks={linkChecks} />
          <TaggedLinkPreview
            primaryName={draft.primary_tool_name}
            primaryUrl={draft.primary_tool_url}
            secondaryName={draft.secondary_tool_name}
            secondaryUrl={draft.secondary_tool_url}
          />
        </Section>

        {/* E. Status & Order */}
        <Section label="E. Status & Order">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Status">
              <select
                value={draft.status}
                onChange={(e) => update("status", e.target.value as "draft" | "published")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
            <Field label="Display Order">
              <Input
                type="number"
                value={draft.display_order}
                onChange={(e) => update("display_order", Number(e.target.value) || 0)}
              />
            </Field>
          </div>
        </Section>

        {/* E2. Collections */}
        <Section
          label="Collections"
          hint="Assign this entry to one or more curated sub-collections shown on /cooking-lab."
        >
          <EntryCollectionsEditor entryId={entry.id} />
        </Section>

        {/* F. Quality Checklist */}
        <Section
          label="F. Quality Checklist (Required to Publish)"
          hint={`All 5 items must be checked to publish. ${qaPassedCount}/5 complete.`}
        >
          <div
            className={`space-y-2 rounded-md border p-4 ${
              qaAllPassed
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-border bg-muted/20"
            }`}
          >
            <CheckRow
              label="Copy reviewed"
              checked={draft.qa_copy_reviewed}
              onCheckedChange={(v) => update("qa_copy_reviewed", v)}
            />
            <CheckRow
              label="Video loads"
              checked={draft.qa_video_loads}
              onCheckedChange={(v) => update("qa_video_loads", v)}
            />
            <CheckRow
              label="Image loads"
              checked={draft.qa_image_loads}
              onCheckedChange={(v) => update("qa_image_loads", v)}
            />
            <CheckRow
              label="Links tested"
              checked={draft.qa_links_tested}
              onCheckedChange={(v) => update("qa_links_tested", v)}
            />
            <CheckRow
              label="Ready for public view"
              checked={draft.qa_ready}
              onCheckedChange={(v) => update("qa_ready", v)}
            />
          </div>
        </Section>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border flex-wrap">
          {publishBlocked && !qaAllPassed && (
            <span className="text-xs text-destructive">
              Complete all QA items to publish ({qaPassedCount}/5)
            </span>
          )}
          {publishBlocked && qaAllPassed && !linksAllPassed && (
            <span className="text-xs text-destructive">
              Fix link errors above to publish
            </span>
          )}
          {!publishBlocked && linksHaveErrors && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Link warnings present
            </span>
          )}
          {dirty && !publishBlocked && (
            <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
          )}
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending || publishBlocked}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type AdminCollection = { id: string; name: string; slug: string };

function EntryCollectionsEditor({ entryId }: { entryId: string }) {
  const queryClient = useQueryClient();

  const { data: collections, isLoading: loadingCollections } = useQuery({
    queryKey: ["admin", "cooking-lab-collections"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cooking_lab_collections")
        .select("id,name,slug")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdminCollection[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: assignedIds } = useQuery({
    queryKey: ["admin", "cooking-lab-entry-collections", entryId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cooking_lab_entry_collections")
        .select("collection_id")
        .eq("entry_id", entryId);
      if (error) throw error;
      return new Set<string>(((data ?? []) as { collection_id: string }[]).map((r) => r.collection_id));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ collectionId, assigned }: { collectionId: string; assigned: boolean }) => {
      if (assigned) {
        const { error } = await (supabase as any)
          .from("cooking_lab_entry_collections")
          .delete()
          .eq("entry_id", entryId)
          .eq("collection_id", collectionId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("cooking_lab_entry_collections")
          .insert({ entry_id: entryId, collection_id: collectionId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cooking-lab-entry-collections", entryId] });
      queryClient.invalidateQueries({ queryKey: ["cooking-lab", "entry-collections", "public"] });
      queryClient.invalidateQueries({ queryKey: ["cooking-lab", "collection"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to update collection"),
  });

  if (loadingCollections) {
    return <p className="text-sm text-muted-foreground">Loading collections…</p>;
  }
  if (!collections || collections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No collections defined yet. Add some via SQL or future Collections admin.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {collections.map((c) => {
        const assigned = assignedIds?.has(c.id) ?? false;
        return (
          <button
            key={c.id}
            type="button"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate({ collectionId: c.id, assigned })}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              assigned
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            } disabled:opacity-50`}
          >
            {assigned ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
        {hint && <p className="text-xs text-muted-foreground/80 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  /** Inline error text. When set, the wrapped <Input /> gets a red ring via [data-field-error] CSS targeting. */
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-field-error={error ? "true" : undefined}>
      <Label className={`text-sm ${error ? "text-destructive" : ""}`}>{label}</Label>
      <div
        className={
          error
            ? "[&_input]:border-destructive [&_input]:ring-1 [&_input]:ring-destructive/40 [&_input]:focus-visible:ring-destructive"
            : ""
        }
      >
        {children}
      </div>
      {error ? (
        <p className="text-xs text-destructive flex items-start gap-1">
          <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

const VIDEO_BUCKET = "cooking-lab-videos";
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];

function VideoUploader({
  currentUrl,
  entryId,
  onUploaded,
}: {
  currentUrl: string | null;
  entryId: string;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const isUploadedVideo = !!currentUrl && currentUrl.includes(`/${VIDEO_BUCKET}/`);

  async function handleFile(file: File) {
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      toast.error("Unsupported file type. Use MP4, WebM, or MOV.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 500 MB.`);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const ts = Date.now();
      const path = `${entryId}/${ts}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(VIDEO_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path);
      if (!pub?.publicUrl) throw new Error("Failed to get public URL");

      onUploaded(pub.publicUrl);
      setProgress(100);
      toast.success("Video uploaded — remember to Save the entry.");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!currentUrl || !isUploadedVideo) return;
    if (!confirm("Remove uploaded video? You'll need to Save to persist this change.")) return;
    try {
      const marker = `/${VIDEO_BUCKET}/`;
      const idx = currentUrl.indexOf(marker);
      if (idx >= 0) {
        const path = currentUrl.substring(idx + marker.length).split("?")[0];
        await supabase.storage.from(VIDEO_BUCKET).remove([path]);
      }
      onUploaded("");
      toast.success("Video removed");
    } catch (e: any) {
      toast.error(e?.message ?? "Remove failed");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <VideoIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Upload video</span>
        </div>
        {isUploadedVideo && (
          <Badge variant="secondary" className="text-xs">Stored video</Badge>
        )}
      </div>

      {isUploadedVideo && currentUrl && (
        <video
          src={currentUrl}
          controls
          preload="metadata"
          className="w-full max-h-64 rounded border border-border bg-background"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex">
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button asChild variant="outline" size="sm" disabled={uploading}>
            <span className="cursor-pointer gap-1.5 inline-flex items-center">
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" /> {isUploadedVideo ? "Replace video" : "Upload MP4 / WebM / MOV"}
                </>
              )}
            </span>
          </Button>
        </label>
        {isUploadedVideo && !uploading && (
          <Button variant="ghost" size="sm" onClick={handleRemove} className="text-destructive">
            <Trash2 className="w-4 h-4 mr-1" /> Remove
          </Button>
        )}
      </div>

      {uploading && (
        <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Supported: MP4, WebM, MOV. Max 500 MB. Public URL is auto-filled below — works for AI-generated clips today and on-camera footage later.
      </p>
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
      <span>{label}</span>
    </label>
  );
}

function EditorialGuidance() {
  return (
    <Card className="bg-muted/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Editorial Guidance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Focus on clarity and usefulness.</li>
          <li>Avoid technical jargon — write like you'd talk to a curious friend.</li>
          <li>Cooking Lab supports deeper guides — it does not chase SEO directly.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function BrandVoiceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="w-4 h-4" />
          Brand Voice — Cooking Lab
        </CardTitle>
        <CardDescription>Read before writing or editing copy.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <h4 className="font-semibold text-foreground mb-1">Tone</h4>
          <p className="text-muted-foreground">Fun, casual, confident. Smart but not technical. Friendly, never condescending.</p>
        </div>
        <div>
          <h4 className="font-semibold text-foreground mb-1">Avoid</h4>
          <p className="text-muted-foreground">Chef jargon ("emulsification matrix"), academic phrasing, vague hype words ("revolutionary", "unlock"), and recipe-style instructions.</p>
        </div>
        <div>
          <h4 className="font-semibold text-foreground mb-1">Sentence length</h4>
          <p className="text-muted-foreground">Aim for 8–18 words per sentence. One idea per sentence.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">✓ Good</p>
            <p className="text-sm text-foreground">"Cook proteins to the exact doneness you want, every single time."</p>
          </div>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs font-semibold text-destructive mb-1">✗ Bad</p>
            <p className="text-sm text-foreground">"Utilize precision thermal immersion to achieve unparalleled protein denaturation outcomes."</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground italic">
          Reminder: Cooking Lab explains <strong>concepts</strong>, not recipes.
        </p>
      </CardContent>
    </Card>
  );
}

function OperatorSOPCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          Operator Guide (SOP)
        </CardTitle>
        <CardDescription>For marketing-trained users managing Cooking Lab content.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Step n={1} title="Add a new entry">
          Click <strong>New Entry</strong> at the top. A draft card appears. Fill in title and a one-sentence description.
        </Step>
        <Step n={2} title="Add the video">
          Paste a YouTube or AI-generated video URL into the Video URL field. Make sure it plays before publishing.
        </Step>
        <Step n={3} title="Add an image">
          Use approved brand assets only. Paste the full image URL.
        </Step>
        <Step n={4} title="Add affiliate tools">
          Use full Amazon URLs (no shorteners). Test every link in an incognito window.
        </Step>
        <Step n={5} title="Run the QA checklist">
          All five checkboxes must be ticked before publishing.
        </Step>
        <Step n={6} title="Publish">
          Set Status to <strong>Published</strong> and toggle <strong>Show in Cooking Lab</strong> to ON. Save.
        </Step>
        <Step n={7} title="Replace AI video with on-camera later">
          Open the entry, replace the Video URL, re-run the QA checklist, save. No other changes needed.
        </Step>
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 mt-4">
          <p className="text-xs font-semibold text-destructive mb-1">Do not edit:</p>
          <ul className="text-sm text-foreground list-disc pl-5 space-y-0.5">
            <li>Site code or routes</li>
            <li>The public Cooking Lab page directly</li>
            <li>Brand colors, logos, or layout outside Brand Config</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold grid place-items-center shrink-0">
        {n}
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function QAChecklistCard() {
  const groups = [
    {
      title: "Pre-publish",
      items: ["Title and description match brand voice", "One-sentence description is truly one sentence", "Video URL plays in a fresh tab", "Image loads at full resolution"],
    },
    {
      title: "Affiliate compliance",
      items: ["Amazon links are full URLs (no shorteners)", "Each link opens to the correct product", "Affiliate disclosure visible at page bottom"],
    },
    {
      title: "Visual consistency",
      items: ["Image style matches other Cooking Lab entries", "Tool names are short and scannable", "Display order is sequential — no duplicates"],
    },
    {
      title: "Final approval",
      items: ["Lead marketer reviewed the live preview", "All 5 per-entry checklist boxes are ticked", "Entry set to Published + Visible"],
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          QA & Approval Checklist
        </CardTitle>
        <CardDescription>Run through this before publishing or weekly as a content sweep.</CardDescription>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
        {groups.map((g) => (
          <div key={g.title} className="rounded-md border border-border p-3 bg-muted/10">
            <h4 className="font-semibold text-foreground mb-2">{g.title}</h4>
            <ul className="space-y-1.5">
              {g.items.map((it) => (
                <li key={it} className="flex items-start gap-2">
                  <span className="mt-1 w-3.5 h-3.5 rounded border border-muted-foreground/40 shrink-0" aria-hidden />
                  <span className="text-muted-foreground">{it}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RoadmapCard() {
  const groups = [
    {
      title: "Heat & Doneness",
      affiliateNote: "Strong affiliate fit — thermometers, sous vide gear.",
      brandNote: "Builds trust through precision.",
      ideas: ["Reverse Sear", "Sous Vide Eggs", "Carryover Cooking", "Oven Calibration"],
    },
    {
      title: "Texture & Structure",
      affiliateNote: "Medium affiliate fit — pasta rollers, knives, blenders.",
      brandNote: "Great brand-trust content.",
      ideas: ["Fresh Pasta", "Whipped Ganache", "Bread Hydration", "Knife Skills"],
    },
    {
      title: "Preservation & Prep",
      affiliateNote: "Strong affiliate fit — freezers, bags, containers.",
      brandNote: "Practical, repeat-watch material.",
      ideas: ["Flash Freezing", "Quick Pickles", "Stock Reduction", "Compound Butter"],
    },
    {
      title: "Emulsions & Sauces",
      affiliateNote: "Medium affiliate fit — immersion blenders, fine strainers.",
      brandNote: "Showcases technical skill.",
      ideas: ["Homemade Mayo", "Hollandaise", "Vinaigrettes That Hold", "Pan Sauces"],
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="w-4 h-4" />
          Content Roadmap
        </CardTitle>
        <CardDescription>10–15 future Cooking Lab topics, grouped by technique type.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {groups.map((g) => (
          <div key={g.title} className="rounded-md border border-border p-3">
            <h4 className="font-semibold text-foreground">{g.title}</h4>
            <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
              <p>💰 {g.affiliateNote}</p>
              <p>🤝 {g.brandNote}</p>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {g.ideas.map((idea) => (
                <li key={idea}>
                  <Badge variant="secondary">{idea}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
