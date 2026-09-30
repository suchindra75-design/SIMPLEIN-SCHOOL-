import { describe, expect, it } from "vitest";
import { queryBoolSchema } from "@/lib/validation/common";

/**
 * Regression suite for the Phase 14 query-flag fix: z.coerce.boolean()
 * maps EVERY non-empty string (including "false" and "0") to true, so
 * ?active=false never archived PYQs (and ?unreadOnly=false mis-filtered).
 */
describe("queryBoolSchema", () => {
  it("parses true values", () => {
    expect(queryBoolSchema.parse("true")).toBe(true);
    expect(queryBoolSchema.parse("1")).toBe(true);
    expect(queryBoolSchema.parse(true)).toBe(true);
  });

  it("parses false values (the broken case)", () => {
    expect(queryBoolSchema.parse("false")).toBe(false);
    expect(queryBoolSchema.parse("0")).toBe(false);
    expect(queryBoolSchema.parse(false)).toBe(false);
  });

  it("stays optional for absent params", () => {
    expect(queryBoolSchema.optional().parse(undefined)).toBeUndefined();
  });

  it("rejects garbage instead of coercing to true", () => {
    expect(() => queryBoolSchema.parse("yes")).toThrow();
    expect(() => queryBoolSchema.parse("")).toThrow();
  });
});
