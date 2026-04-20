import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const TEST_ADMIN_EMAIL = "test-admin@vpsfinest.com";
export const TEST_ADMIN_PASSWORD = "AdminTest2026!";
const TEST_ADMIN_NAME = "Test Admin";

async function ensureCallerIsAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Auth check failed");
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

/**
 * Provision (or re-provision) a fixed test admin account with full access.
 * - Creates the auth user with email confirmed (no email sent).
 * - Resets the password if the user already exists.
 * - Ensures profile + admin role are set.
 * - Clears any per-user section overrides so role permissions apply.
 */
export const createTestAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureCallerIsAdmin(context.userId);

    // Find existing user (paginate just in case)
    let existingId: string | null = null;
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      const match = data.users.find(
        (u) => (u.email ?? "").toLowerCase() === TEST_ADMIN_EMAIL,
      );
      if (match) {
        existingId = match.id;
        break;
      }
      if (data.users.length < 200) break;
    }

    let userId: string;
    let created = false;

    if (existingId) {
      userId = existingId;
      // Reset password and ensure email is confirmed
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          password: TEST_ADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: TEST_ADMIN_NAME },
        },
      );
      if (updErr) throw new Error(updErr.message);
    } else {
      const { data: createdUser, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: TEST_ADMIN_EMAIL,
          password: TEST_ADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: TEST_ADMIN_NAME },
        });
      if (createErr) throw new Error(createErr.message);
      if (!createdUser.user?.id) throw new Error("Failed to create user");
      userId = createdUser.user.id;
      created = true;
    }

    // Ensure profile row
    await supabaseAdmin.from("profiles").upsert(
      { user_id: userId, email: TEST_ADMIN_EMAIL, full_name: TEST_ADMIN_NAME },
      { onConflict: "user_id" },
    );

    // Ensure admin role (ignore unique conflict)
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" })
      .then(() => null, () => null);

    // Clear any per-user section overrides so the admin role's full access applies
    await supabaseAdmin
      .from("user_section_overrides")
      .delete()
      .eq("user_id", userId)
      .then(() => null, () => null);

    // Audit log
    await supabaseAdmin.from("access_audit_log").insert({
      actor_user_id: context.userId,
      action: created ? "test_admin_created" : "test_admin_reset",
      target_user_id: userId,
      target_email: TEST_ADMIN_EMAIL,
      details: { full_access: true },
    });

    return {
      created,
      userId,
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD,
    };
  });
