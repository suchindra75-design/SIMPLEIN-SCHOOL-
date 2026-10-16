import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_HOMEWORK_MIME, ALLOWED_PHOTO_MIME, MAX_HOMEWORK_FILE_BYTES, MAX_PHOTO_BYTES } from "@/lib/services/storage";

/** Migration 0023 must allow exactly what the app's validators allow. */
const sql = readFileSync(new URL("../../supabase/migrations/0023_storage_bucket_limits.sql", import.meta.url), "utf8");

function bucketRule(bucketIdPattern: string): { limit: number; mimes: string[] } {
  const block = sql
    .split(/;\s*\n/)
    .find((stmt) => stmt.includes("UPDATE storage.buckets") && stmt.includes(bucketIdPattern));
  if (block === undefined) throw new Error(`no UPDATE for ${bucketIdPattern}`);
  const limit = Number(/file_size_limit = (\d+)/.exec(block)?.[1]);
  const mimes = [...block.matchAll(/'([a-z]+\/[a-z0-9.+-]+)'/g)].map((m) => m[1]!);
  return { limit, mimes };
}

describe("storage bucket limits (migration 0023) match the app validators", () => {
  it("document buckets", () => {
    const rule = bucketRule("'homework-attachments'");
    expect(rule.limit).toBe(MAX_HOMEWORK_FILE_BYTES);
    expect([...rule.mimes].sort()).toEqual([...ALLOWED_HOMEWORK_MIME].sort());
    for (const id of ["notice-attachments", "fee-receipts", "pyqs"]) expect(sql).toContain(`'${id}'`);
  });

  it("photo buckets", () => {
    const rule = bucketRule("'student-photos'");
    expect(rule.limit).toBe(MAX_PHOTO_BYTES);
    expect([...rule.mimes].sort()).toEqual([...ALLOWED_PHOTO_MIME].sort());
  });
});
