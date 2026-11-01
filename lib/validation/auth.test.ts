import { describe, expect, it } from "vitest";
import {
  passwordResetRequestSchema,
  passwordUpdateSchema,
  roleLoginSchema,
} from "./auth";

describe("passwordResetRequestSchema", () => {
  it("accepts a role + identifier and defaults the role to ADMIN", () => {
    const parsed = passwordResetRequestSchema.parse({ identifier: "T-1001" });
    expect(parsed.role).toBe("ADMIN");
    expect(parsed.identifier).toBe("T-1001");
  });

  it("trims the identifier and rejects an empty one", () => {
    expect(passwordResetRequestSchema.parse({ role: "TEACHER", identifier: "  x  " }).identifier).toBe("x");
    expect(passwordResetRequestSchema.safeParse({ identifier: "   " }).success).toBe(false);
    expect(passwordResetRequestSchema.safeParse({ identifier: "" }).success).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(passwordResetRequestSchema.safeParse({ role: "ROOT", identifier: "x" }).success).toBe(false);
  });
});

describe("passwordUpdateSchema", () => {
  it("accepts a matching password of at least 8 characters", () => {
    expect(passwordUpdateSchema.safeParse({ password: "sup3rsecret", confirmPassword: "sup3rsecret" }).success).toBe(true);
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(passwordUpdateSchema.safeParse({ password: "short1", confirmPassword: "short1" }).success).toBe(false);
  });

  it("rejects when the two passwords do not match", () => {
    const result = passwordUpdateSchema.safeParse({ password: "sup3rsecret", confirmPassword: "different1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });
});

// Sanity: the existing login schema still parses (no test file existed before).
describe("roleLoginSchema (existing)", () => {
  it("requires an identifier and a password", () => {
    expect(roleLoginSchema.safeParse({ identifier: "a", password: "b" }).success).toBe(true);
    expect(roleLoginSchema.safeParse({ identifier: "", password: "b" }).success).toBe(false);
    expect(roleLoginSchema.safeParse({ identifier: "a", password: "" }).success).toBe(false);
  });
});
