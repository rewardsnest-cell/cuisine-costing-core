import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SynonymSchema = z.object({
  id: z.string().uuid().optional(),
  synonym: z.string().min(1).max(64),
  canonical: z.string().min(1).max(64),
  dimension: z.enum(["weight", "volume", "count"]),
  factor: z.coerce.number().positive(),
  notes: z.string().max(500).nullable().optional(),
});

export const peListUnitSynonyms = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("pe_unit_synonyms")
    .select("*")
    .order("dimension", { ascending: true })
    .order("synonym", { ascending: true });
  if (error) throw new Error(error.message);
  return { rows: data ?? [] };
});

export const peUpsertUnitSynonym = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SynonymSchema.parse(d))
  .handler(async ({ data }) => {
    const payload = {
      synonym: data.synonym.toLowerCase().trim(),
      canonical: data.canonical.toLowerCase().trim(),
      dimension: data.dimension,
      factor: data.factor,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("pe_unit_synonyms")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { row };
    }
    const { data: row, error } = await supabaseAdmin
      .from("pe_unit_synonyms")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { row };
  });

export const peDeleteUnitSynonym = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("pe_unit_synonyms").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
