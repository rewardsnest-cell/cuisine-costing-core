// Pricing v2 — Keyword library server functions.
// Manages a reusable list of Kroger product search keywords used by the
// "sweep selected" admin tool to ingest broad product coverage.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type KeywordRow = {
  id: string;
  keyword: string;
  category: string | null;
  enabled: boolean;
  notes: string | null;
  last_run_at: string | null;
  last_hits: number | null;
  created_at: string;
  updated_at: string;
};

export const listKeywordLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data, error } = await supabase
      .from("pricing_v2_keyword_library")
      .select("id,keyword,category,enabled,notes,last_run_at,last_hits,created_at,updated_at")
      .order("category", { ascending: true, nullsFirst: false })
      .order("keyword", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as KeywordRow[] };
  });

const addSchema = z.object({
  keyword: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const addKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: row, error } = await supabase
      .from("pricing_v2_keyword_library")
      .insert({
        keyword: data.keyword,
        category: data.category ?? null,
        notes: data.notes ?? null,
        created_by: userId ?? null,
        enabled: true,
      })
      .select("id,keyword,category,enabled,notes,last_run_at,last_hits,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return { row: row as KeywordRow };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  keyword: z.string().trim().min(1).max(120).optional(),
});

export const updateKeyword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const patch: Record<string, any> = {};
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.category !== undefined) patch.category = data.category;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.keyword !== undefined) patch.keyword = data.keyword;
    const { error } = await supabase
      .from("pricing_v2_keyword_library")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const bulkToggleSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  enabled: z.boolean(),
});

export const bulkSetEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkToggleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("pricing_v2_keyword_library")
      .update({ enabled: data.enabled })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { updated: data.ids.length };
  });

const deleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export const deleteKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("pricing_v2_keyword_library")
      .delete()
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: data.ids.length };
  });

const bulkAddSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(120)).min(1).max(500),
  category: z.string().trim().max(60).optional(),
});

export const bulkAddKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkAddSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const rows = data.keywords.map((k) => ({
      keyword: k,
      category: data.category ?? null,
      enabled: true,
      created_by: userId ?? null,
    }));
    // Use upsert on lower(keyword) — but that's an expression index, so we
    // best-effort insert and ignore duplicates by catching unique violations
    // per row. Simpler: insert with onConflict do nothing isn't supported on
    // expression indexes by supabase-js — so do a select first.
    const { data: existing } = await supabase
      .from("pricing_v2_keyword_library")
      .select("keyword");
    const existingSet = new Set(
      (existing ?? []).map((r: any) => String(r.keyword).toLowerCase())
    );
    const fresh = rows.filter((r) => !existingSet.has(r.keyword.toLowerCase()));
    if (!fresh.length) return { added: 0, skipped: rows.length };
    const { error } = await supabase
      .from("pricing_v2_keyword_library")
      .insert(fresh);
    if (error) throw new Error(error.message);
    return { added: fresh.length, skipped: rows.length - fresh.length };
  });

// After a sweep, update last_run_at + last_hits stats per keyword.
const markRunSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  hits_total: z.number().int().min(0),
});

export const markKeywordsRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => markRunSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("pricing_v2_keyword_library")
      .update({
        last_run_at: new Date().toISOString(),
        last_hits: data.hits_total,
      })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
