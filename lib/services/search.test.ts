import { describe, expect, it } from "vitest";
import { containsSearchTerm } from "@/lib/services/search";

describe("containsSearchTerm", () => {
  it("wraps ordinary text for a contains-match", () => {
    expect(containsSearchTerm("  Aarav Sharma ")).toBe("%Aarav Sharma%");
    expect(containsSearchTerm("98765")).toBe("%98765%");
    expect(containsSearchTerm("anita.verma@greenfield.test")).toBe("%anita.verma@greenfield.test%");
  });

  it("removes PostgREST filter syntax so search text cannot add predicates", () => {
    const term = containsSearchTerm("x,school_id.neq.0,id.eq.(1)");
    expect(term).not.toMatch(/[,()]/);
    expect(containsSearchTerm('a"b\\c')).toBe("%a b c%");
  });

  it("removes LIKE wildcards, including PostgREST's * alias", () => {
    expect(containsSearchTerm("50%_off*")).toBe("%50 off%");
  });

  it("returns null when nothing searchable is left", () => {
    expect(containsSearchTerm("%,()*")).toBeNull();
    expect(containsSearchTerm("   ")).toBeNull();
  });
});
