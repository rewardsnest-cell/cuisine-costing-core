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
  const publishBlocked = wantsPublished && !qaAllPassed;

  const saveMut = useMutation({
    mutationFn: async () => {
      if (publishBlocked) {
        throw new Error("Complete all 5 QA checklist items before publishing.");
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
        <Section label="F. Quality Checklist (Required)">
          <div className="space-y-2 rounded-md border border-border p-4 bg-muted/20">
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

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
          <Button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending} className="gap-2">
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
