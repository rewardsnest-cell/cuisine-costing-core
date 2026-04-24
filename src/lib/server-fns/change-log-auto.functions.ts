import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Scan recent audit events and create DRAFT change log entries for significant
 * patterns. Idempotent: skips audit IDs already linked to an existing entry.
 *
 * Triggered manually by admin. Never modifies domain data.
 */
export const generateChangeLogDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;

    // 1. Pull last 30 days of relevant audit events
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: auditRows, error: auditErr } = await sb
      .from("access_audit_log")
      .select("id, created_at, action, actor_email, details")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    if (auditErr) throw new Error(auditErr.message);

    // 2. Pull existing linked IDs to avoid duplicates
    const { data: existing, error: existErr } = await sb
      .from("change_log_entries")
      .select("linked_audit_event_ids");
    if (existErr) throw new Error(existErr.message);

    const linkedSet = new Set<string>();
    for (const row of existing ?? []) {
      for (const id of (row.linked_audit_event_ids ?? []) as string[]) {
        linkedSet.add(id);
      }
    }

    type Draft = {
      title: string;
      summary: string;
      ids: string[];
    };
    const drafts: Draft[] = [];

    for (const row of auditRows ?? []) {
      if (linkedSet.has(row.id)) continue;
      const action = String(row.action || "").toLowerCase();
      const d = (row.details ?? {}) as Record<string, any>;

      // Pattern 1: cost update approved with >5% change
      if (
        (action.includes("cost_update_approved") || action.includes("cost_approve")) &&
        Math.abs(Number(d.percent_change ?? 0)) > 5
      ) {
        drafts.push({
          title: `Significant cost update approved (${Number(d.percent_change).toFixed(1)}%)`,
          summary:
            `An admin approved a cost update with a ${Number(d.percent_change).toFixed(2)}% change ` +
            `on ${new Date(row.created_at).toLocaleDateString()}. ` +
            `Source: ${d.source ?? "unknown"}. Actor: ${row.actor_email ?? "system"}.`,
          ids: [row.id],
        });
        continue;
      }

      // Pattern 2: Manual cost override
      if (action.includes("manual_cost_override") || action.includes("manual_cost_set")) {
        drafts.push({
          title: `Manual cost override applied`,
          summary:
            `Manual cost override on ${new Date(row.created_at).toLocaleDateString()} ` +
            `by ${row.actor_email ?? "admin"}. ` +
            (d.proposed_cost != null ? `New cost: ${d.proposed_cost}.` : ""),
          ids: [row.id],
        });
        continue;
      }

      // Pattern 3: Menu module state change
      if (action.includes("menu_module_state") || action.includes("module_state_change")) {
        drafts.push({
          title: `Menu module state change → ${d.new_state ?? d.state ?? "updated"}`,
          summary:
            `Menu module ${d.module_id ?? ""} state changed ` +
            (d.previous_state ? `from "${d.previous_state}" ` : "") +
            (d.new_state ? `to "${d.new_state}" ` : "") +
            `on ${new Date(row.created_at).toLocaleDateString()} by ${row.actor_email ?? "admin"}.`,
          ids: [row.id],
        });
        continue;
      }

      // Pattern 4: Pricing model activated / archived
      if (
        action.includes("pricing_model_activated") ||
        action.includes("pricing_model_archived") ||
        action.includes("pricing_activation") ||
        action.includes("national_pricing_activated")
      ) {
        const verb = action.includes("archived") ? "archived" : "activated";
        drafts.push({
          title: `Pricing model ${verb}`,
          summary:
            `A pricing model was ${verb} on ${new Date(row.created_at).toLocaleDateString()} ` +
            `by ${row.actor_email ?? "admin"}. Review the linked audit event for full context.`,
          ids: [row.id],
        });
        continue;
      }
    }

    if (drafts.length === 0) {
      return { created: 0, message: "No new significant events found." };
    }

    // Insert all drafts
    const payload = drafts.map((d) => ({
      title: d.title,
      summary: d.summary,
      linked_audit_event_ids: d.ids,
      status: "draft",
      auto_generated: true,
      author_user_id: context.userId,
      author_email: context.userEmail ?? null,
    }));

    const { error: insErr, count } = await sb
      .from("change_log_entries")
      .insert(payload, { count: "exact" });
    if (insErr) throw new Error(insErr.message);

    return { created: count ?? drafts.length, message: `Created ${count ?? drafts.length} draft(s).` };
  });
