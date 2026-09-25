import { describe, expect, it } from "vitest";
import {
  normalizeHeader,
  splitFullName,
  validateImportRows,
} from "@/lib/validation/import";

const catalog = new Map([
  [
    "grade 7",
    {
      classId: "c7",
      sections: new Map([
        ["a", "sec7a"],
        ["b", "sec7b"],
      ]),
    },
  ],
]);

describe("normalizeHeader", () => {
  it("matches canonical, aliased, and mapped headers", () => {
    expect(normalizeHeader("firstName")).toBe("firstName");
    expect(normalizeHeader("Admission Number")).toBe("admissionNo");
    expect(normalizeHeader("ADM No")).toBe("admissionNo");
    expect(normalizeHeader("Division")).toBe("section");
    expect(normalizeHeader("Parent Mobile")).toBe("parentPhone");
    expect(normalizeHeader("Unknown Column")).toBeNull();
    expect(normalizeHeader("Guardian", { Guardian: "parentName" })).toBe(
      "parentName",
    );
  });

  it("splits full names", () => {
    expect(splitFullName("Rahul Sharma")).toEqual({
      first: "Rahul",
      last: "Sharma",
    });
    expect(splitFullName("Ananya")).toEqual({ first: "Ananya", last: "" });
  });
});

describe("validateImportRows", () => {
  it("accepts clean rows and resolves ids", () => {
    const { valid, errors } = validateImportRows(
      [
        {
          firstName: "Rahul",
          lastName: "Kumar",
          admissionNo: "A100",
          class: "Grade 7",
          section: "A",
          parentName: "Rajesh",
          parentPhone: "99999",
        },
      ],
      catalog,
      new Set(),
    );
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({
      classId: "c7",
      sectionId: "sec7a",
      admissionNo: "A100",
    });
  });

  it("rejects unknown class/section, bad dates, bad gender", () => {
    const { valid, errors } = validateImportRows(
      [
        {
          firstName: "X",
          admissionNo: "A1",
          class: "Grade 99",
          section: "A",
          dob: "01-02-2015",
          gender: "unknown",
        },
        {
          firstName: "Y",
          admissionNo: "A2",
          class: "Grade 7",
          section: "Z",
          admissionDate: "2026/06/01",
        },
      ],
      catalog,
      new Set(),
    );
    expect(valid).toHaveLength(0);
    const fields = errors.map((e) => e.field).sort();
    expect(fields).toContain("class");
    expect(fields).toContain("section");
    expect(fields).toContain("dob");
    expect(fields).toContain("gender");
    expect(fields).toContain("admissionDate");
  });

  it("rejects duplicate admission numbers in-file and existing", () => {
    const { valid, errors } = validateImportRows(
      [
        { firstName: "A", admissionNo: "D1", class: "Grade 7", section: "A" },
        { firstName: "B", admissionNo: "d1", class: "Grade 7", section: "B" },
        { firstName: "C", admissionNo: "TAKEN", class: "Grade 7", section: "A" },
      ],
      catalog,
      new Set(["taken"]),
    );
    expect(valid.map((v) => v.admissionNo)).toEqual(["D1"]);
    expect(errors.filter((e) => e.field === "admissionNo")).toHaveLength(2);
  });

  it("normalizes gender shorthands", () => {
    const { valid } = validateImportRows(
      [{ firstName: "A", admissionNo: "G1", class: "Grade 7", section: "A", gender: "F" }],
      catalog,
      new Set(),
    );
    expect(valid[0]?.gender).toBe("female");
  });
});
