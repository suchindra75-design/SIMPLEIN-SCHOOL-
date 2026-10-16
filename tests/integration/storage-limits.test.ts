import { afterAll, describe, expect, it } from "vitest";
import { as, schoolId, serviceClient } from "./helpers";

/**
 * Migration 0023 through the real Storage API: an admin uploading directly
 * with their own session (not through the app) is held to the same size and
 * type limits as the app. Uses paths the admin may write (fee-receipts is
 * admin-writable under the school prefix) and removes what it creates.
 */
describe("storage bucket limits (direct uploads with a user session)", () => {
  const svc = serviceClient();
  const created: string[] = [];

  afterAll(async () => {
    if (created.length > 0) await svc.storage.from("fee-receipts").remove(created);
  });

  const path = async (name: string) =>
    `schools/${await schoolId("greenfield-demo")}/fee-receipts/limit-test/${Date.now()}_${name}`;

  it("accepts an allowed type within the limit", async () => {
    const admin = await as("admin");
    const p = await path("ok.pdf");
    // Same call shape as the app (lib/services/storage.ts): raw bytes + contentType.
    const bytes = new TextEncoder().encode("%PDF-1.4 test").buffer;
    const { error } = await admin.db.storage.from("fee-receipts").upload(p, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(error).toBeNull();
    created.push(p);
  });

  it("rejects a disallowed file type", async () => {
    const admin = await as("admin");
    const p = await path("bad.html");
    created.push(p); // removed afterwards even if the upload wrongly succeeds
    const { error } = await admin.db.storage
      .from("fee-receipts")
      .upload(p, new TextEncoder().encode("<script>alert(1)</script>").buffer, {
        contentType: "text/html",
      });
    expect(error).not.toBeNull();
  });

  it("rejects a file over the 4,000,000-byte bucket limit", async () => {
    const admin = await as("admin");
    const p = await path("big.pdf");
    created.push(p);
    const { error } = await admin.db.storage
      .from("fee-receipts")
      .upload(p, new Uint8Array(4_000_001).buffer, { contentType: "application/pdf" });
    expect(error).not.toBeNull();
  });
});
