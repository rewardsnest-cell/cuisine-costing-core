import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { CookingLabSection } from "@/routes/cooking-lab";
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
 * Automated, synchronous validation of an entry's affiliate URLs.
 * Runs on every keystroke — no network calls (Amazon blocks CORS HEAD checks
 * from browsers, and a server probe would be slow + rate-limited). These
 * structural checks catch ~all real-world authoring mistakes: missing links,
 * shortener URLs, wrong host, malformed paths, missing product IDs.
 */
function validateEntryLinks(entry: CookingLabEntry): LinkCheck[] {
  return [
    validateAmazonLink({
      id: "primary",
      label: "Primary tool link",
      name: entry.primary_tool_name,
      url: entry.primary_tool_url,
      required: true,
    }),
    validateAmazonLink({
      id: "secondary",
      label: "Secondary tool link",
      name: entry.secondary_tool_name,
      url: entry.secondary_tool_url,
      required: false,
    }),
  ];
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

function CookingLabManager() {
  const queryClient = useQueryClient();
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

      {/* New entry */}
      <div className="flex justify-end">
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
        <div className="space-y-6">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}

      {/* Editorial guidance */}
      <EditorialGuidance />
      <BrandVoiceCard />
      <OperatorSOPCard />
      <QAChecklistCard />
      <RoadmapCard />
    </div>
  );
}

function EntryCard({ entry }: { entry: CookingLabEntry }) {
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

  const saveMut = useMutation({
    mutationFn: async () => {
      if (publishBlocked) {
        if (!qaAllPassed) {
          throw new Error("Complete all 5 QA checklist items before publishing.");
        }
        throw new Error("Fix all link validation errors before publishing.");
      }
      const { id, ...rest } = draft;
      const { error } = await (supabase as any)
        .from("cooking_lab_entries")
        .update(rest)
        .eq("id", id);
      if (error) throw error;
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
          <Field label="Video URL" hint="AI-generated or YouTube. Replace later when you upgrade to on-camera footage.">
            <Input
              value={draft.video_url ?? ""}
              onChange={(e) => update("video_url", e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
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
            <Field label="Primary Tool Name">
              <Input
                value={draft.primary_tool_name ?? ""}
                onChange={(e) => update("primary_tool_name", e.target.value)}
              />
            </Field>
            <Field label="Primary Amazon Link">
              <Input
                value={draft.primary_tool_url ?? ""}
                onChange={(e) => update("primary_tool_url", e.target.value)}
                placeholder="https://www.amazon.com/..."
              />
            </Field>
            <Field label="Secondary Tool Name">
              <Input
                value={draft.secondary_tool_name ?? ""}
                onChange={(e) => update("secondary_tool_name", e.target.value)}
              />
            </Field>
            <Field label="Secondary Amazon Link">
              <Input
                value={draft.secondary_tool_url ?? ""}
                onChange={(e) => update("secondary_tool_url", e.target.value)}
                placeholder="https://www.amazon.com/..."
              />
            </Field>
          </div>
          <LinkChecksPanel checks={linkChecks} />
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
