import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config.mjs";
import { MAX_HOMEWORK_FILE_BYTES, MAX_PHOTO_BYTES, validateDocumentUpload } from "@/lib/services/storage";
import {
  checkRequestFiles,
  declaredBodyTooLarge,
  MAX_DOCUMENT_BYTES,
  MAX_FILES_PER_REQUEST_BYTES,
  PLATFORM_REQUEST_BODY_LIMIT_BYTES,
  SERVER_ACTION_BODY_LIMIT_BYTES,
} from "@/lib/uploads/limits";

const file = (name: string, size: number) => new File([new Uint8Array(size)], name, { type: "application/pdf" });

describe("upload budget vs the platform request limit", () => {
  it("keeps the server-action body limit below Vercel's 4.5 MB request limit", () => {
    expect(SERVER_ACTION_BODY_LIMIT_BYTES).toBeLessThan(PLATFORM_REQUEST_BODY_LIMIT_BYTES);
    const configured = (nextConfig as { experimental: { serverActions: { bodySizeLimit: number } } }).experimental
      .serverActions.bodySizeLimit;
    expect(configured).toBe(SERVER_ACTION_BODY_LIMIT_BYTES);
  });

  it("fits a full-budget multi-file multipart request (with form fields) under both limits", async () => {
    // Worst case the app accepts: question paper + solution + answer key at the
    // combined budget, plus the metadata fields and a Next.js action field.
    const form = new FormData();
    form.append("$ACTION_ID_0123456789abcdef0123456789abcdef01234567", "");
    form.append("classId", "8f1b7a52-3c2d-4e5f-9a6b-1c2d3e4f5a6b");
    form.append("subjectId", "9a2c8b63-4d3e-4f60-8b7c-2d3e4f5a6b7c");
    form.append("yearLabel", "2025-26");
    form.append("examBoardName", "CBSE");
    form.append("title", "Mathematics question paper with a fairly long descriptive title");
    form.append("file", file("question-paper-with-a-long-file-name.pdf", 2_000_000));
    form.append("solution", file("solution-with-a-long-file-name.pdf", 1_000_000));
    form.append("answerKey", file("answer-key-with-a-long-file-name.pdf", MAX_FILES_PER_REQUEST_BYTES - 3_000_000));
    const encoded = await new Response(form).arrayBuffer();
    expect(encoded.byteLength).toBeGreaterThan(MAX_FILES_PER_REQUEST_BYTES);
    expect(encoded.byteLength).toBeLessThanOrEqual(SERVER_ACTION_BODY_LIMIT_BYTES);
    expect(encoded.byteLength).toBeLessThan(PLATFORM_REQUEST_BODY_LIMIT_BYTES);
  });

  it("uses one budget for documents and keeps photos smaller", () => {
    expect(MAX_HOMEWORK_FILE_BYTES).toBe(MAX_DOCUMENT_BYTES);
    expect(MAX_PHOTO_BYTES).toBeLessThan(MAX_DOCUMENT_BYTES);
    expect(validateDocumentUpload({ size: MAX_DOCUMENT_BYTES, type: "application/pdf", name: "a.pdf" })).toBeNull();
    expect(validateDocumentUpload({ size: MAX_DOCUMENT_BYTES + 1, type: "application/pdf", name: "a.pdf" })).not.toBeNull();
  });
});

describe("checkRequestFiles", () => {
  it("accepts files up to the combined budget", () => {
    expect(checkRequestFiles([{ name: "a.pdf", size: MAX_FILES_PER_REQUEST_BYTES }])).toBeNull();
    expect(checkRequestFiles([{ name: "a.pdf", size: 2_000_000 }, { name: "b.pdf", size: 2_000_000 }])).toBeNull();
  });

  it("rejects one oversized file and several files that only fail together", () => {
    expect(checkRequestFiles([{ name: "a.pdf", size: MAX_FILES_PER_REQUEST_BYTES + 1 }])).toMatch(/file must be 4 MB or less/);
    expect(
      checkRequestFiles([
        { name: "a.pdf", size: 3_000_000 },
        { name: "b.pdf", size: 3_000_000 },
      ]),
    ).toMatch(/Files together must be 4 MB or less \(these are 6\.0 MB\)/);
  });

  it("ignores empty optional file inputs", () => {
    expect(checkRequestFiles([{ name: "", size: 0 }, { name: "a.pdf", size: 10 }])).toBeNull();
  });
});

describe("declaredBodyTooLarge", () => {
  it("flags declared bodies above the server limit only", () => {
    expect(declaredBodyTooLarge(null)).toBe(false);
    expect(declaredBodyTooLarge(String(SERVER_ACTION_BODY_LIMIT_BYTES))).toBe(false);
    expect(declaredBodyTooLarge(String(SERVER_ACTION_BODY_LIMIT_BYTES + 1))).toBe(true);
    expect(declaredBodyTooLarge("not-a-number")).toBe(false);
  });
});
