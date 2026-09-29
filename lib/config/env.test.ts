import { describe, expect, it } from "vitest";
import { getEnvStatus, missingEnvSummary } from "@/lib/config/env";

describe("env staging check (presence-only, no secret values)", () => {
  it("reports all-configured when every var is set", () => {
    const status = getEnvStatus({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      ONBOARDING_SECRET: "secret",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    expect(status.missingRequired).toEqual([]);
    expect(status.missingOptional).toEqual([]);
    expect(status.supabasePublicConfigured).toBe(true);
    expect(status.serviceRoleConfigured).toBe(true);
    expect(status.onboardingConfigured).toBe(true);
    expect(missingEnvSummary(status)).toBeNull();
  });

  it("lists missing required names without leaking values", () => {
    const status = getEnvStatus({
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: "service",
      ONBOARDING_SECRET: "",
    });
    expect(status.supabasePublicConfigured).toBe(false);
    expect(status.onboardingConfigured).toBe(false);
    expect(status.missingRequired).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(status.missingRequired).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(status.missingRequired).toContain("ONBOARDING_SECRET");
    // The summary must name vars only — never echo a value.
    const summary = missingEnvSummary(status);
    expect(summary).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(summary).not.toContain("service");
  });

  it("treats an empty env as fully unconfigured (fail-closed dev/CI)", () => {
    const status = getEnvStatus({});
    expect(status.missingRequired).toHaveLength(4);
    expect(status.missingOptional).toEqual(["NEXT_PUBLIC_APP_URL"]);
    expect(status.supabasePublicConfigured).toBe(false);
    expect(status.serviceRoleConfigured).toBe(false);
  });
});
