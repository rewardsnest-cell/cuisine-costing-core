import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download, FileText, GitCompare, ScrollText, Loader2 } from "lucide-react";
import {
  generateProjectStateExport,
  runChangeImpactAnalysis,
  createDecisionLog,
} from "@/lib/server-fns/governance.functions";
import { downloadFile } from "@/lib/admin/project-audit";
import { logAndDownload } from "@/lib/admin/log-download";
import { LoadingState } from "@/components/LoadingState";

import { PageHelpCard } from "@/components/admin/PageHelpCard";

export const Route = createFileRoute("/admin/intelligence")({
  head: () => ({
    meta: [{ title: "Project Intelligence — Admin" }],
  }),
  component: IntelligencePage,
});

function IntelligencePage() {
  return (
    <div className="space-y-6">
      <PageHelpCard route="/admin/intelligence" />
      <div>
        <h1 className="font-display text-2xl font-bold">Project Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          Read-only audits, change impact analyses, and immutable decision logs. Powered by versioned governance prompts.
        </p>
      </div>

      <Tabs defaultValue="export" className="space-y-4">
        <TabsList>
          <TabsTrigger value="export"><FileText className="w-4 h-4 mr-1.5" /> State Export</TabsTrigger>
          <TabsTrigger value="impact"><GitCompare className="w-4 h-4 mr-1.5" /> Impact Analysis</TabsTrigger>
          <TabsTrigger value="decisions"><ScrollText className="w-4 h-4 mr-1.5" /> Decision Logs</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>

        <TabsContent value="export"><ExportTab /></TabsContent>
        <TabsContent value="impact"><ImpactTab /></TabsContent>
        <TabsContent value="decisions"><DecisionsTab /></TabsContent>
        <TabsContent value="prompts"><PromptsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Export Tab ----------
function ExportTab() {
  const qc = useQueryClient();
  const generate = useServerFn(generateProjectStateExport);
  const { data: exports = [], isLoading, error } = useQuery({
    queryKey: ["audit-exports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_audit_exports")
        .select("id, prompt_version, executed_at, output_filename")
        .order("executed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const mut = useMutation({
    mutationFn: async () => generate(),
    onSuccess: async (res) => {
      await logAndDownload({
        content: res.content,
        filename: res.filename,
        mimeType: "text/markdown",
        kind: "admin_export",
        module: "intelligence",
        parameters: { type: "project_state_export" },
      });
      toast.success("Export generated and downloaded");
      qc.invalidateQueries({ queryKey: ["audit-exports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Download Project State Export</CardTitle>
        <CardDescription>
          Generates a deterministic markdown snapshot using Prompt A. Single execution per click — no AI loops.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Generate & Download
        </Button>

        <div>
          <h3 className="text-sm font-semibold mb-2">Recent exports</h3>
          {isLoading ? (
            <LoadingState label="Loading recent exports…" />
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load: {(error as Error).message}</p>
          ) : exports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exports.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.output_filename}</TableCell>
                    <TableCell><Badge variant="outline">{e.prompt_version}</Badge></TableCell>
                    <TableCell className="text-xs">{new Date(e.executed_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const { data, error } = await supabase
                            .from("project_audit_exports")
                            .select("output_content, output_filename")
                            .eq("id", e.id)
                            .single();
                          if (error) return toast.error(error.message);
                          downloadFile(data.output_content, data.output_filename, "text/markdown");
                        }}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Impact Tab ----------
function ImpactTab() {
  const qc = useQueryClient();
  const run = useServerFn(runChangeImpactAnalysis);
  const [selectedExport, setSelectedExport] = useState<string>("");
  const [description, setDescription] = useState("");

  const { data: exports = [] } = useQuery({
    queryKey: ["audit-exports", "for-impact"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_audit_exports")
        .select("id, output_filename, executed_at")
        .order("executed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: analyses = [] } = useQuery({
    queryKey: ["impact-analyses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_impact_analyses")
        .select("id, prompt_version, executed_at, output_filename, change_description")
        .order("executed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!selectedExport && exports.length > 0) setSelectedExport(exports[0].id);
  }, [exports, selectedExport]);

  const mut = useMutation({
    mutationFn: async () =>
      run({ data: { audit_export_id: selectedExport, change_description: description } }),
    onSuccess: async (res) => {
      await logAndDownload({
        content: res.content,
        filename: res.filename,
        mimeType: "text/markdown",
        kind: "admin_export",
        module: "intelligence",
        parameters: { type: "change_impact_analysis", audit_export_id: selectedExport, change_description: description },
        sourceId: selectedExport || null,
      });
      toast.success("Analysis saved and downloaded");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["impact-analyses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Run Change Impact Analysis</CardTitle>
          <CardDescription>
            Uses Prompt B. Requires an existing project state export and a change description.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Base export</Label>
            <Select value={selectedExport} onValueChange={setSelectedExport}>
              <SelectTrigger><SelectValue placeholder="Select an export" /></SelectTrigger>
              <SelectContent>
                {exports.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.output_filename} — {new Date(e.executed_at).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {exports.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No exports yet — generate one first.</p>
            )}
          </div>
          <div>
            <Label>Change description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the proposed change…"
              rows={6}
            />
          </div>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !selectedExport || description.trim().length < 10}
          >
            {mut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GitCompare className="w-4 h-4 mr-2" />}
            Run Analysis
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent analyses</CardTitle></CardHeader>
        <CardContent>
          {analyses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No analyses yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyses.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.output_filename}</TableCell>
                    <TableCell className="text-xs max-w-md truncate">{a.change_description}</TableCell>
                    <TableCell className="text-xs">{new Date(a.executed_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const { data, error } = await supabase
                            .from("change_impact_analyses")
                            .select("output_content, output_filename")
                            .eq("id", a.id)
                            .single();
                          if (error) return toast.error(error.message);
                          downloadFile(data.output_content, data.output_filename, "text/markdown");
                        }}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Decisions Tab ----------
function DecisionsTab() {
  const qc = useQueryClient();
  const create = useServerFn(createDecisionLog);
  const [form, setForm] = useState({
    decision_title: "",
    problem_statement: "",
    options_considered: "",
    final_decision: "",
    decision_rationale: "",
    expected_impact: "",
    status: "Active" as "Proposed" | "Active" | "Superseded" | "Reversed",
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["decision-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decision_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const mut = useMutation({
    mutationFn: async () => create({ data: form }),
    onSuccess: () => {
      toast.success("Decision logged (immutable)");
      setForm({
        decision_title: "", problem_statement: "", options_considered: "",
        final_decision: "", decision_rationale: "", expected_impact: "", status: "Active",
      });
      qc.invalidateQueries({ queryKey: ["decision-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Create Decision Log</CardTitle>
          <CardDescription>Uses Prompt C. Once saved, decisions are immutable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Decision title</Label><Input value={form.decision_title} onChange={(e) => setForm({ ...form, decision_title: e.target.value })} /></div>
          <div><Label>Problem statement</Label><Textarea rows={3} value={form.problem_statement} onChange={(e) => setForm({ ...form, problem_statement: e.target.value })} /></div>
          <div><Label>Options considered</Label><Textarea rows={3} value={form.options_considered} onChange={(e) => setForm({ ...form, options_considered: e.target.value })} /></div>
          <div><Label>Final decision</Label><Textarea rows={2} value={form.final_decision} onChange={(e) => setForm({ ...form, final_decision: e.target.value })} /></div>
          <div><Label>Rationale</Label><Textarea rows={3} value={form.decision_rationale} onChange={(e) => setForm({ ...form, decision_rationale: e.target.value })} /></div>
          <div><Label>Expected impact</Label><Textarea rows={2} value={form.expected_impact} onChange={(e) => setForm({ ...form, expected_impact: e.target.value })} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Proposed">Proposed</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Superseded">Superseded</SelectItem>
                <SelectItem value="Reversed">Reversed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.decision_title || form.problem_statement.length < 10}>
            {mut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScrollText className="w-4 h-4 mr-2" />}
            Save Decision (Immutable)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Decision history</CardTitle></CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions yet.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((d) => (
                <div key={d.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">{d.decision_title}</h4>
                    <Badge>{d.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</p>
                  <p className="text-sm"><span className="font-medium">Decision:</span> {d.final_decision}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Prompts Tab ----------
function PromptsTab() {
  const { data: prompts = [], isLoading, error } = useQuery({
    queryKey: ["governance-prompts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("governance_prompts")
        .select("*")
        .order("prompt_name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Versioned Prompt Registry</CardTitle>
        <CardDescription>
          Prompts are immutable once versioned. New versions are added by migration, not edited in place.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState label="Loading prompt registry…" />
        ) : error ? (
          <p className="text-sm text-destructive">
            Failed to load prompts: {(error as Error).message}. The Governance tables may not be readable by your account — confirm you have admin role.
          </p>
        ) : prompts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prompts registered.</p>
        ) : (
          <div className="space-y-3">
            {prompts.map((p) => (
              <div key={p.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-sm">{p.prompt_name}</h4>
                  <div className="flex gap-2">
                    <Badge variant="outline">{p.prompt_version}</Badge>
                    <Badge variant={p.prompt_status === "Stable" ? "default" : "secondary"}>{p.prompt_status}</Badge>
                  </div>
                </div>
                <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap font-mono max-h-48 overflow-auto">
                  {p.prompt_content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
