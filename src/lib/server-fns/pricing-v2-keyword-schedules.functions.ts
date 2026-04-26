// Pricing v2 — Keyword sweep schedules.
// Lets admins schedule recurring multi-keyword sweeps on a fixed cadence,
// optionally with an end date or run-count limit, and optionally sweeping
// the entire keyword library instead of a fixed selection.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ScheduleRow = {
  id: string;
  name: string;
  cadence_hours: number;
  keyword_ids: string[];
  keyword_limit: number;
  skip_weight_normalization: boolean;
  enabled: boolean;
  use_all_keywords: boolean;
  expires_at: string | null;
  max_runs: number | null;
  run_count: number;
  last_run_at: string | null;
  last_run_id: string | null;
  next_run_at: string;
  created_at: string;
  updated_at: string;
};

export const listKeywordSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("pricing_v2_keyword_schedules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as ScheduleRow[] };
  });

const upsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    cadence_hours: z.number().int().min(1).max(24 * 30),
    keyword_ids: z.array(z.string().uuid()).max(1000).default([]),
    keyword_limit: z.number().int().min(1).max(500).default(250),
    skip_weight_normalization: z.boolean().default(true),
    enabled: z.boolean().default(true),
    use_all_keywords: z.boolean().default(false),
    expires_at: z.string().datetime().nullable().optional(),
    max_runs: z.number().int().min(1).max(100000).nullable().optional(),
    next_run_at: z.string().datetime().optional(),
  })
  .refine((v) => v.use_all_keywords || v.keyword_ids.length > 0, {
    message: "Pick at least one keyword or enable 'sweep all keywords'.",
    path: ["keyword_ids"],
  });

export const upsertKeywordSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const payload: Record<string, any> = {
      name: data.name,
      cadence_hours: data.cadence_hours,
      keyword_ids: data.use_all_keywords ? [] : data.keyword_ids,
      keyword_limit: data.keyword_limit,
      skip_weight_normalization: data.skip_weight_normalization,
      enabled: data.enabled,
      use_all_keywords: data.use_all_keywords,
      expires_at: data.expires_at ?? null,
      max_runs: data.max_runs ?? null,
    };
    if (data.next_run_at) payload.next_run_at = data.next_run_at;

    if (data.id) {
      const { data: row, error } = await supabase
        .from("pricing_v2_keyword_schedules")
        .update(payload)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { row: row as ScheduleRow };
    } else {
      payload.created_by = userId ?? null;
      if (!payload.next_run_at) payload.next_run_at = new Date().toISOString();
      const { data: row, error } = await supabase
        .from("pricing_v2_keyword_schedules")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { row: row as ScheduleRow };
    }
  });

export const deleteKeywordSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("pricing_v2_keyword_schedules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// History of runs initiated by a given schedule (best-effort: matches via params.run_params.schedule_id).
export const listScheduleRunHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ schedule_id: z.string().uuid(), limit: z.number().int().min(1).max(100).default(20) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: rows, error } = await supabase
      .from("pricing_v2_runs")
      .select("run_id, status, started_at, ended_at, counts_in, counts_out, warnings_count, errors_count, params, notes, last_error, triggered_by")
      .eq("stage", "catalog")
      .filter("params->run_params->>schedule_id", "eq", data.schedule_id)
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { runs: rows ?? [] };
  });
