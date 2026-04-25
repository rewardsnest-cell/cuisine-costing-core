import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Auth check failed");
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

async function getActorEmail(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

async function logAudit(opts: {
  actorUserId: string;
  action: string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  details?: Record<string, any>;
}) {
  const actorEmail = await getActorEmail(opts.actorUserId);
  await supabaseAdmin.from("access_audit_log").insert({
    actor_user_id: opts.actorUserId,
    actor_email: actorEmail,
    action: opts.action,
    target_user_id: opts.targetUserId ?? null,
    target_email: opts.targetEmail ?? null,
    details: opts.details ?? {},
  });
}

// ---- Invite employee ----
const inviteSchema = z.object({
  email: z.string().trim().email().max(255),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(["employee", "admin"]),
});

export const inviteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const origin = process.env.SITE_URL || process.env.VITE_SITE_URL || "";
    const redirectTo = origin ? `${origin}/reset-password` : undefined;

    const { data: invited, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        data: { full_name: data.fullName, invited_role: data.role },
        redirectTo,
      });
    if (inviteErr) throw new Error(inviteErr.message);

    const newUserId = invited.user?.id;
    if (!newUserId) throw new Error("Invite created but no user id returned");

    // Ensure profile + role rows
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { user_id: newUserId, email: data.email, full_name: data.fullName },
        { onConflict: "user_id" },
      );
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role })
      .then(() => null, () => null); // ignore unique conflict
    if (data.role === "employee" || data.role === "admin") {
      await supabaseAdmin
        .from("employee_profiles")
        .upsert({ user_id: newUserId, active: true }, { onConflict: "user_id" });
    }
    await supabaseAdmin.from("employee_invites").insert({
      email: data.email,
      full_name: data.fullName,
      role: data.role,
      invited_by: context.userId,
      invited_user_id: newUserId,
      status: "pending",
    });

    await logAudit({
      actorUserId: context.userId,
      action: "employee_invited",
      targetUserId: newUserId,
      targetEmail: data.email,
      details: { role: data.role, full_name: data.fullName },
    });

    return { success: true, userId: newUserId };
  });

// ---- Resend invite ----
export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ inviteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { data: invite, error } = await supabaseAdmin
      .from("employee_invites")
      .select("*")
      .eq("id", data.inviteId)
      .maybeSingle();
    if (error || !invite) throw new Error("Invite not found");
    if (invite.status !== "pending") throw new Error("Invite is not pending");

    const origin = process.env.SITE_URL || process.env.VITE_SITE_URL || "";
    const redirectTo = origin ? `${origin}/reset-password` : undefined;

    const { error: e2 } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      invite.email,
      { redirectTo },
    );
    if (e2) throw new Error(e2.message);

    await supabaseAdmin
      .from("employee_invites")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.inviteId);

    await logAudit({
      actorUserId: context.userId,
      action: "invite_resent",
      targetUserId: invite.invited_user_id,
      targetEmail: invite.email,
    });
    return { success: true };
  });

// ---- Revoke invite ----
export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ inviteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { data: invite, error } = await supabaseAdmin
      .from("employee_invites")
      .select("*")
      .eq("id", data.inviteId)
      .maybeSingle();
    if (error || !invite) throw new Error("Invite not found");
    if (invite.status !== "pending") throw new Error("Invite is not pending");

    if (invite.invited_user_id) {
      // Delete the auth user (cascades remove roles/profile via app handling)
      await supabaseAdmin.auth.admin.deleteUser(invite.invited_user_id);
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", invite.invited_user_id);
      await supabaseAdmin
        .from("employee_profiles")
        .delete()
        .eq("user_id", invite.invited_user_id);
    }
    await supabaseAdmin
      .from("employee_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", data.inviteId);

    await logAudit({
      actorUserId: context.userId,
      action: "invite_revoked",
      targetUserId: invite.invited_user_id,
      targetEmail: invite.email,
    });
    return { success: true };
  });

// ---- Assign / remove role ----
const roleMutationSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "employee", "admin", "moderator"]),
  add: z.boolean(),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roleMutationSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    if (data.add) {
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role })
        .then(() => null, () => null); // ignore unique conflict
      if (data.role === "employee" || data.role === "admin") {
        await supabaseAdmin
          .from("employee_profiles")
          .upsert({ user_id: data.userId, active: true }, { onConflict: "user_id" });
      }
    } else {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
    }

    const { data: target } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    await logAudit({
      actorUserId: context.userId,
      action: data.add ? "role_added" : "role_removed",
      targetUserId: data.userId,
      targetEmail: target.user?.email ?? null,
      details: { role: data.role },
    });
    return { success: true };
  });

// ---- Update role permission ----
export const setRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        role: z.enum(["user", "employee", "social_media", "sales", "admin"]),
        section: z.string().min(1).max(64),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    await supabaseAdmin
      .from("role_section_permissions")
      .upsert(
        { role: data.role, section: data.section, enabled: data.enabled },
        { onConflict: "role,section" },
      );
    await logAudit({
      actorUserId: context.userId,
      action: "permission_changed",
      details: { role: data.role, section: data.section, enabled: data.enabled },
    });
    return { success: true };
  });

// ---- Set / clear per-user override ----
export const setUserOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        section: z.string().min(1).max(64),
        // null = clear (inherit role)
        enabled: z.boolean().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    if (data.enabled === null) {
      await supabaseAdmin
        .from("user_section_overrides")
        .delete()
        .eq("user_id", data.userId)
        .eq("section", data.section);
      await logAudit({
        actorUserId: context.userId,
        action: "override_cleared",
        targetUserId: data.userId,
        details: { section: data.section },
      });
    } else {
      await supabaseAdmin
        .from("user_section_overrides")
        .upsert(
          { user_id: data.userId, section: data.section, enabled: data.enabled },
          { onConflict: "user_id,section" },
        );
      await logAudit({
        actorUserId: context.userId,
        action: "override_set",
        targetUserId: data.userId,
        details: { section: data.section, enabled: data.enabled },
      });
    }
    return { success: true };
  });
