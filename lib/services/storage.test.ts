import { describe, expect, it } from "vitest";
import { toCamel } from "@/lib/services/camel";
import {
  buildPhotoPath,
  validatePhotoUpload,
} from "@/lib/services/storage";

describe("toCamel", () => {
  it("maps snake_case rows and nested joins", () => {
    expect(
      toCamel({
        admission_no: "A1",
        display_name: "Rahul",
        classes: { name: "Grade 7" },
        tags: [{ tag_name: "x" }],
        dob: null,
      }),
    ).toEqual({
      admissionNo: "A1",
      displayName: "Rahul",
      classes: { name: "Grade 7" },
      tags: [{ tagName: "x" }],
      dob: null,
    });
  });
});

describe("photo uploads", () => {
  it("builds tenant-prefixed paths with safe extensions", () => {
    const path = buildPhotoPath("school-a", "student", "s1", "Photo.JPG");
    expect(path.startsWith("schools/school-a/students/s1/")).toBe(true);
    expect(path.endsWith(".jpg")).toBe(true);
    const evil = buildPhotoPath("school-a", "teacher", "t1", "x.exe");
    expect(evil.endsWith(".jpg")).toBe(true);
  });

  it("validates type and size", () => {
    expect(
      validatePhotoUpload({ size: 100, type: "image/png", name: "a.png" }),
    ).toBeNull();
    expect(
      validatePhotoUpload({ size: 100, type: "application/pdf", name: "a.pdf" }),
    ).toMatch(/JPEG/);
    expect(
      validatePhotoUpload({ size: 3 * 1024 * 1024, type: "image/jpeg", name: "a.jpg" }),
    ).toMatch(/2 MB/);
    expect(
      validatePhotoUpload({ size: 0, type: "image/jpeg", name: "a.jpg" }),
    ).toMatch(/non-empty/);
  });
});
