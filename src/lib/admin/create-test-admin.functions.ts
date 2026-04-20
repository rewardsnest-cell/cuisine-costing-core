import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const TEST_ADMIN_EMAIL = "test-admin@vpsfinest.com";
export const TEST_ADMIN_PASSWORD = "AdminTest2026!";
const TEST_ADMIN_NAME = "Test Admin";

type AdminCheckInput = {
  userId: string;
  email?: string | null;
};

async function hasAdminRoleForUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    throw new Error("Auth check failed");
  }

  return (data ?? []).some((row: { role: string }) => row.role === "admin");
}

async function ensureCallerIsAdmin({ userId, email }: AdminCheckInput) {
  if (await hasAdminRoleForUserId(userId)) {
    return;
  }

  const normalizedEmail = email?.trim().toLowerCase();

  if (normalizedEmail) {
    const { data: matchingProfiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email")
      .ilike("email", normalizedEmail);

    if (profileError) {
      throw new Error("Auth check failed");
    }

    for (const profile of matchingProfiles ?? []) {
      if (profile.user_id && (await hasAdminRoleForUserId(profile.user_id))) {
        console.warn("[createTestAdminUser] Admin check used email fallback", {
          authUserId: userId,
          matchedAdminUserId: profile.user_id,
          email: normalizedEmail,
        });
        return;
      }
    }
  }

  console.warn("[createTestAdminUser] Admin check failed", {
    authUserId: userId,
    email: normalizedEmail ?? null,
  });
  throw new Error("Forbidden: admin only");
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
    await ensureCallerIsAdmin({
      userId: context.userId,
      email: typeof context.claims.email === "string" ? context.claims.email : null,
    });

    let existingId: string | null = null;
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      const match = data.users.find(
        (user) => (user.email ?? "").toLowerCase() === TEST_ADMIN_EMAIL,
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
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          password: TEST_ADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: TEST_ADMIN_NAME },
        },
      );
      if (updateError) throw new Error(updateError.message);
    } else {
      const { data: createdUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: TEST_ADMIN_EMAIL,
          password: TEST_ADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: TEST_ADMIN_NAME },
        });
      if (createError) throw new Error(createError.message);
      if (!createdUser.user?.id) throw new Error("Failed to create user");
      userId = createdUser.user.id;
      created = true;
    }

    await supabaseAdmin.from("profiles").upsert(
      { user_id: userId, email: TEST_ADMIN_EMAIL, full_name: TEST_ADMIN_NAME },
      { onConflict: "user_id" },
    );

    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" })
      .then(() => null, () => null);

    await supabaseAdmin
      .from("user_section_overrides")
      .delete()
      .eq("user_id", userId)
      .then(() => null, () => null);

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