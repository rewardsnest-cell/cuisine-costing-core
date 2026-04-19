import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROJECT_AUDIT_MD } from "@/lib/admin/project-audit";

const PROMPT_NAMES = {
  EXPORT: "UNIVERSAL PROJECT STATE EXPORT",
  IMPACT: "UNIVERSAL CHANGE IMPACT ANALYSIS",
  DECISION: "UNIVERSAL DECISION LOG",
} as const;

async function getStablePrompt(sb: any, name: string) {
  const { data, error } = await sb
    .from("governance_prompts")
    .select("prompt_version, prompt_content")
    .eq("prompt_name", name)
    .eq("prompt_status", "Stable")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load prompt "${name}": ${error.message}`);
  if (!data) throw new Error(`No Stable version of prompt "${name}" found`);
  return data as { prompt_version: string; prompt_content: string };
}

function todayStamp() {
  return new Date().toISOString().split("T")[0];
}

// 1. Generate project state export (deterministic, no AI)
export const generateProjectStateExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const prompt = await getStablePrompt(sb, PROMPT_NAMES.EXPORT);

    const header = `# UNIVERSAL PROJECT STATE EXPORT\n\n_Prompt version: ${prompt.prompt_version}_\n_Generated: ${new Date().toISOString()}_\n\n---\n\n`;
    const footer = `\n\n---\n\nEND OF UNIVERSAL PROJECT STATE EXPORT\n`;
    const body = PROJECT_AUDIT_MD;
    const output = header + body + footer;
    const filename = `project_state_export_${prompt.prompt_version}_${todayStamp()}.md`;

    const { data, error } = await sb
      .from("project_audit_exports")
      .insert({
        prompt_version: prompt.prompt_version,
        executed_by: context.userId,
        output_content: output,
        output_filename: filename,
      })
      .select("id, executed_at, output_filename")
      .single();
    if (error) throw new Error(`Failed to save export: ${error.message}`);

    return { id: data.id, filename: data.output_filename, content: output, executed_at: data.executed_at };
  });

// 2. Run change impact analysis (templated, no AI)
const impactInput = z.object({
  audit_export_id: z.string().uuid(),
  change_description: z.string().min(10).max(10000),
});

export const runChangeImpactAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => impactInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const prompt = await getStablePrompt(sb, PROMPT_NAMES.IMPACT);

    const { data: exportRow, error: exportErr } = await sb
      .from("project_audit_exports")
      .select("id, prompt_version, output_filename, executed_at")
      .eq("id", data.audit_export_id)
      .maybeSingle();
    if (exportErr) throw new Error(exportErr.message);
    if (!exportRow) throw new Error("Audit export not found");

    const sections = [
      "Proposed Changes Summary",
      "Affected Components",
      "Data Impact",
      "Logic & Behavior Impact",
      "AI & Automation Impact",
      "Risk Identification",
      "Dependency & Coupling Analysis",
      "Impact Classification (Safe | Moderate | High Risk)",
    ];
    const body = sections
      .map((s, i) => {
        if (i === 0) {
          return `## ${i + 1}. ${s}\n\n${data.change_description}\n`;
        }
        return `## ${i + 1}. ${s}\n\n_To be filled in by reviewer._\n`;
      })
      .join("\n");

    const output =
      `# UNIVERSAL CHANGE IMPACT ANALYSIS\n\n` +
      `_Prompt version: ${prompt.prompt_version}_\n` +
      `_Generated: ${new Date().toISOString()}_\n` +
      `_Based on export: ${exportRow.output_filename} (${exportRow.executed_at})_\n\n` +
      `---\n\n` +
      body +
      `\n---\n\nEND OF CHANGE IMPACT ANALYSIS\n`;

    const filename = `change_impact_${prompt.prompt_version}_${todayStamp()}.md`;

    const { data: row, error } = await sb
      .from("change_impact_analyses")
      .insert({
        prompt_version: prompt.prompt_version,
        executed_by: context.userId,
        audit_export_id: exportRow.id,
        change_description: data.change_description,
        output_content: output,
        output_filename: filename,
      })
      .select("id, executed_at, output_filename")
      .single();
    if (error) throw new Error(`Failed to save analysis: ${error.message}`);

    return { id: row.id, filename: row.output_filename, content: output, executed_at: row.executed_at };
  });

// 3. Create decision log (immutable)
const decisionInput = z.object({
  decision_title: z.string().min(3).max(255),
  problem_statement: z.string().min(10).max(5000),
  options_considered: z.string().min(10).max(10000),
  final_decision: z.string().min(3).max(5000),
  decision_rationale: z.string().min(10).max(5000),
  expected_impact: z.string().min(3).max(5000),
  status: z.enum(["Proposed", "Active", "Superseded", "Reversed"]).default("Active"),
});

export const createDecisionLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: row, error } = await sb
      .from("decision_logs")
      .insert({
        decision_title: data.decision_title,
        problem_statement: data.problem_statement,
        options_considered: data.options_considered,
        final_decision: data.final_decision,
        decision_rationale: data.decision_rationale,
        expected_impact: data.expected_impact,
        status: data.status,
        owner: context.userId,
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(`Failed to save decision: ${error.message}`);

    return { id: row.id, created_at: row.created_at };
  });
