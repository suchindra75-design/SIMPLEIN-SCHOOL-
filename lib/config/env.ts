/**
 * Safe environment-configuration check (staging integration only).
 *
 * - Presence-only: this module NEVER reads, returns, logs, or compares
 *   secret VALUES. It reports variable NAMES and whether each is set.
 * - No ERP behavior change: callers decide how to react (warn vs fail).
 * - Testable: pass an explicit env record in tests; defaults to process.env.
 */

export const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export const REQUIRED_SERVER_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ONBOARDING_SECRET",
] as const;

/** Optional but recommended (canonical origin for links/emails). */
export const OPTIONAL_ENV = ["NEXT_PUBLIC_APP_URL"] as const;

export type EnvName =
  | (typeof REQUIRED_PUBLIC_ENV)[number]
  | (typeof REQUIRED_SERVER_ENV)[number]
  | (typeof OPTIONAL_ENV)[number];

export interface EnvStatus {
  /** True when the Supabase browser/server clients can be constructed. */
  supabasePublicConfigured: boolean;
  /** True when trusted service-role ops (onboarding/provisioning) are possible. */
  serviceRoleConfigured: boolean;
  /** True when POST /api/v1/onboarding/school can accept requests. */
  onboardingConfigured: boolean;
  /** Names of required vars that are missing or empty (never values). */
  missingRequired: string[];
  /** Names of optional vars that are missing or empty (never values). */
  missingOptional: string[];
}

function isSet(env: Record<string, string | undefined>, name: string): boolean {
  const value = env[name];
  return value !== undefined && value !== "";
}

export function getEnvStatus(
  env: Record<string, string | undefined> = process.env,
): EnvStatus {
  const missingRequired: string[] = [];
  for (const name of [...REQUIRED_PUBLIC_ENV, ...REQUIRED_SERVER_ENV]) {
    if (!isSet(env, name)) missingRequired.push(name);
  }
  const missingOptional: string[] = [];
  for (const name of OPTIONAL_ENV) {
    if (!isSet(env, name)) missingOptional.push(name);
  }
  return {
    supabasePublicConfigured:
      isSet(env, "NEXT_PUBLIC_SUPABASE_URL") &&
      isSet(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleConfigured:
      isSet(env, "NEXT_PUBLIC_SUPABASE_URL") &&
      isSet(env, "SUPABASE_SERVICE_ROLE_KEY"),
    onboardingConfigured: isSet(env, "ONBOARDING_SECRET"),
    missingRequired,
    missingOptional,
  };
}

/**
 * One-line human summary naming MISSING vars only (no values).
 * Returns null when everything required is present.
 */
export function missingEnvSummary(status: EnvStatus): string | null {
  if (status.missingRequired.length === 0) return null;
  return `Missing required env: ${status.missingRequired.join(", ")} (see .env.example; never commit real values)`;
}
