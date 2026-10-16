import { describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/lib/auth/session";
import { publicErrorMessage } from "@/lib/errors/public-error";
import { toCamel } from "@/lib/services/camel";
import { ConflictError, NotFoundError } from "@/lib/services/errors";
import {
  buildPhotoPath,
  matchesDeclaredType,
  StorageServiceError,
  throwForStorage,
  validateDocumentUpload,
  validatePhotoUpload,
} from "@/lib/services/storage";

vi.spyOn(console, "error").mockImplementation(() => {});

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

describe("content signatures (uploads must be what they claim)", () => {
  const withHeader = (header: number[] | string, size = 64) => {
    const bytes = new Uint8Array(size);
    bytes.set(typeof header === "string" ? new TextEncoder().encode(header) : header);
    return bytes.buffer;
  };

  it("accepts real PDF, JPEG, PNG, WebP and DOCX/XLSX headers", () => {
    expect(matchesDeclaredType("application/pdf", withHeader("%PDF-1.7"))).toBe(true);
    expect(matchesDeclaredType("application/pdf", withHeader("\n\n%PDF-1.4"))).toBe(true); // header may follow junk
    expect(matchesDeclaredType("image/jpeg", withHeader([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(matchesDeclaredType("image/png", withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(matchesDeclaredType("image/webp", withHeader("RIFF\0\0\0\0WEBPVP8 "))).toBe(true);
    expect(matchesDeclaredType("application/vnd.openxmlformats-officedocument.wordprocessingml.document", withHeader([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  });

  it("refuses content that does not match the declared type", () => {
    expect(matchesDeclaredType("application/pdf", withHeader("<html><script>alert(1)</script>"))).toBe(false);
    expect(matchesDeclaredType("image/png", withHeader("<svg onload=alert(1)>"))).toBe(false);
    expect(matchesDeclaredType("image/jpeg", withHeader("MZ\x90\0"))).toBe(false);
    expect(matchesDeclaredType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", withHeader("a,b,c"))).toBe(false);
    expect(validateDocumentUpload({ name: "x.pdf", type: "application/pdf", size: 64, bytes: withHeader("<html>") })).toMatch(/content does not match/);
    expect(validatePhotoUpload({ name: "x.png", type: "image/png", size: 64, bytes: withHeader("<svg>") })).toMatch(/content does not match/);
  });

  it("keeps formats without a reliable signature working (legacy Office, CSV labelled as Excel, text)", () => {
    expect(matchesDeclaredType("application/vnd.ms-excel", withHeader("Name,Class\nAsha,7"))).toBe(true);
    expect(matchesDeclaredType("application/msword", withHeader([0xd0, 0xcf, 0x11, 0xe0]))).toBe(true);
    expect(matchesDeclaredType("text/plain", withHeader("notes"))).toBe(true);
  });

  it("refuses web-page, script and macro extensions whatever the declared type", () => {
    for (const name of ["page.html", "image.svg", "data.xml", "run.ps1", "macro.xlsm", "tool.exe"]) {
      expect(validateDocumentUpload({ name, type: "application/pdf", size: 64, bytes: withHeader("%PDF-1.4") })).toMatch(/not allowed/);
    }
  });
});

describe("Storage errors shown to users (L8)", () => {
  const storageError = (statusCode: string, code: string, message = "raw storage message") => ({ message, status: 400, statusCode, code });

  it("maps size, type, duplicate, permission and missing-file rejections to readable errors", () => {
    expect(() => throwForStorage(storageError("413", "EntityTooLarge"))).toThrow(new ConflictError("The file is too large for this upload."));
    expect(() => throwForStorage(storageError("415", "InvalidMimeType"))).toThrow(new ConflictError("This file type is not allowed."));
    expect(() => throwForStorage(storageError("409", "KeyAlreadyExists"))).toThrow(ConflictError);
    expect(() => throwForStorage(storageError("403", "AccessDenied", "new row violates row-level security policy"))).toThrow(ForbiddenError);
    expect(() => throwForStorage(storageError("404", "NoSuchKey"), "Receipt not found")).toThrow(new NotFoundError("Receipt not found"));
  });

  it("keeps anything else generic (logged, redacted), never the raw message for users", () => {
    let caught: unknown;
    try {
      throwForStorage(storageError("500", "InternalError", 'backend "s3://bucket/schools/x" failed for parent@example.com'));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StorageServiceError);
    expect((caught as Error).message).not.toMatch(/s3:\/\/|example\.com/);
    expect(publicErrorMessage(caught, "t")).toMatch(/^Something went wrong/);
  });
});
