// Pricing v2 — In-app notifications for keyword sweep schedules.
// Powers the bell icon on the Keywords admin page. Admin-only via RLS.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ScheduleNotification = {
  id: string;
  schedule_id: string | null;
  schedule_name: string | null;
  event_type: "run_success" | "run_error" | "auto_disabled";
  severity: "info" | "warning" | "error" | "success";
  title: string;
  message: string | null;
  run_id: string | null;
  metadata: Record<string, any>;
  read_at: string | null;
  created_at: string;
};

export const listScheduleNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).default(50),
        unread_only: z.boolean().default(false),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase
      .from("pricing_v2_schedule_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.unread_only) q = q.is("read_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const { count: unreadCount } = await supabase
      .from("pricing_v2_schedule_notifications")
      .select("*", { count: "exact", head: true })
      .is("read_at", null);

    return {
      rows: (rows ?? []) as ScheduleNotification[],
      unread_count: unreadCount ?? 0,
    };
  });

export const markScheduleNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).max(500).optional(),
        all: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const nowIso = new Date().toISOString();
    let q = supabase
      .from("pricing_v2_schedule_notifications")
      .update({ read_at: nowIso })
      .is("read_at", null);
    if (!data.all) {
      if (!data.ids?.length) return { ok: true, updated: 0 };
      q = q.in("id", data.ids);
    }
    const { error, count } = await q.select("id", { count: "exact" });
    if (error) throw new Error(error.message);
    return { ok: true, updated: count ?? 0 };
  });

export const clearScheduleNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        only_read: z.boolean().default(true),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    let q = supabase.from("pricing_v2_schedule_notifications").delete();
    if (data.only_read) q = q.not("read_at", "is", null);
    else q = q.gte("created_at", "1970-01-01"); // match-all guard
    const { error, count } = await q.select("id", { count: "exact" });
    if (error) throw new Error(error.message);
    return { ok: true, deleted: count ?? 0 };
  });
