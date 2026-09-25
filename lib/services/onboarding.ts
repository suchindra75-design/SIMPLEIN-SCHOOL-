import { createAdminClient } from "@/lib/supabase/admin";
import type { OnboardingSchoolInput } from "@/lib/validation/onboarding";

/** Maps to HTTP 409 — e.g. duplicate slug or admin email. */
export class OnboardingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingConflictError";
  }
}

export interface OnboardedSchool {
  school: { id: string; name: string; slug: string };
  adminUserId: string;
  adminEmail: string;
}

/**
 * Trusted server-only operation (service-role client, bypasses RLS).
 * Creates: schools row → auth.users identity → public.users profile →
 * user_roles grants. Best-effort rollback keeps partial provisioning
 * from stranding records.
 *
 * Ordinary users can NEVER reach this: the API route requires the
 * server-only ONBOARDING_SECRET bearer token, so nobody can self-assign
 * to an existing school through this path.
 */
export async function createSchoolWithAdmin(
  input: OnboardingSchoolInput,
): Promise<OnboardedSchool> {
  const admin = createAdminClient();

  const { data: school, error: schoolError } = await admin
    .from("schools")
    .insert({
      name: input.school.name,
      slug: input.school.slug,
      address: input.school.address ?? null,
      phone: input.school.phone ?? null,
      email: input.school.email ?? null,
      timezone: input.school.timezone,
      is_active: true,
    })
    .select("id, name, slug")
    .single();

  if (schoolError !== null || school === null) {
    if (schoolError?.code === "23505") {
      throw new OnboardingConflictError("School slug already exists");
    }
    throw new Error(`School creation failed: ${schoolError?.message}`);
  }

  const { data: identity, error: identityError } =
    await admin.auth.admin.createUser({
      email: input.admin.email,
      password: input.admin.password,
      email_confirm: true,
      user_metadata: { full_name: input.admin.fullName },
    });

  if (identityError !== null || identity.user === null) {
    await admin.from("schools").delete().eq("id", school.id);
    const duplicate =
      identityError?.message.toLowerCase().includes("already") ?? false;
    if (duplicate) {
      throw new OnboardingConflictError("Admin email is already registered");
    }
    throw new Error(`Admin identity failed: ${identityError?.message}`);
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .insert({
      auth_user_id: identity.user.id,
      school_id: school.id,
      email: input.admin.email,
      full_name: input.admin.fullName,
      phone: input.admin.phone ?? null,
      is_active: true,
    })
    .select("id")
    .single();

  if (profileError !== null || profile === null) {
    await admin.auth.admin.deleteUser(identity.user.id);
    await admin.from("schools").delete().eq("id", school.id);
    if (profileError?.code === "23505") {
      throw new OnboardingConflictError("Admin email already in this school");
    }
    throw new Error(`Admin profile failed: ${profileError?.message}`);
  }

  const { error: rolesError } = await admin.from("user_roles").insert(
    input.roles.map((role) => ({ user_id: profile.id, role })),
  );

  if (rolesError !== null) {
    await admin.from("users").delete().eq("id", profile.id);
    await admin.auth.admin.deleteUser(identity.user.id);
    await admin.from("schools").delete().eq("id", school.id);
    throw new Error(`Role grant failed: ${rolesError.message}`);
  }

  return {
    school: { id: school.id, name: school.name, slug: school.slug },
    adminUserId: profile.id,
    adminEmail: input.admin.email,
  };
}
