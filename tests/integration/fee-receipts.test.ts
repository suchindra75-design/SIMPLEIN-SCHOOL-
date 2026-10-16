import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/auth/session";
import { ConflictError } from "@/lib/services/errors";
import { getPaymentReceiptUrl, recordPayment, setPaymentReceipt, verifyPaymentRecord } from "@/lib/services/fees";
import { uploadToBucket } from "@/lib/services/storage";
import { as, serviceClient, studentByAdmission, type Actor } from "./helpers";

/**
 * Migration 0026 through the real Storage API and PostgREST: once a payment
 * is verified, its receipt (the record's reference AND the stored file) can no
 * longer be replaced, overwritten, moved or deleted with a user session —
 * neither through the app nor by calling Storage directly. Checked against
 * the stored bytes, not only the audit log. Uses Arjun's seeded fee
 * (GPS-2026-005) and removes what it creates (audit rows stay).
 */
describe("verified receipt integrity (database + Storage)", () => {
  const svc = serviceClient();
  const BUCKET = "fee-receipts";
  let maker: Actor;
  let checker: Actor;
  let feeId = "";
  const payments: string[] = [];
  const objects: string[] = [];
  let verifiedId = "";
  let verifiedPath = "";
  const original = new TextEncoder().encode("%PDF-1.4\n% original receipt\n");

  const pdf = (label: string) => {
    const bytes = new TextEncoder().encode(`%PDF-1.4\n% ${label}\n`);
    return { name: `${label}.pdf`, type: "application/pdf", size: bytes.byteLength, bytes: bytes.slice().buffer };
  };
  const stored = async (path: string) => {
    const { data, error } = await svc.storage.from(BUCKET).download(path);
    return error === null ? new Uint8Array(await data.arrayBuffer()) : null;
  };
  const receiptPathOf = async (id: string) => {
    const { data } = await svc.from("fee_payment_records").select("receipt_path").eq("id", id).single();
    return (data as { receipt_path: string | null }).receipt_path;
  };

  beforeAll(async () => {
    maker = await as("admin");
    checker = await as("admin2");
    const arjun = await studentByAdmission("GPS-2026-005");
    const { data } = await svc.from("student_fees").select("id").eq("student_id", arjun.id).single();
    feeId = (data as { id: string }).id;

    // Maker records and attaches the original receipt; checker verifies it.
    const { id } = await recordPayment(maker.db, maker.ctx, feeId, { amount: 100, paidOn: "2026-10-12", mode: "CASH" });
    payments.push(id);
    verifiedId = id;
    await setPaymentReceipt(maker.db, maker.ctx, id, {
      name: "original.pdf",
      type: "application/pdf",
      size: original.byteLength,
      bytes: original.slice().buffer,
    });
    verifiedPath = (await receiptPathOf(id))!;
    objects.push(verifiedPath);
    await verifyPaymentRecord(checker.db, checker.ctx, id);
  });

  afterAll(async () => {
    // Trusted cleanup (service role).
    for (const id of payments) await svc.from("fee_payment_records").delete().eq("id", id);
    if (objects.length > 0) await svc.storage.from(BUCKET).remove(objects);
  });

  it("stores the receipt in the payment's own folder", () => {
    expect(verifiedPath.startsWith(`schools/${maker.ctx.profile.schoolId}/fee-receipts/${verifiedId}/`)).toBe(true);
  });

  it("the app refuses to replace the receipt of a verified payment (nothing uploaded)", async () => {
    await expect(setPaymentReceipt(maker.db, maker.ctx, verifiedId, pdf("swap"))).rejects.toBeInstanceOf(ConflictError);
    const { data } = await svc.storage.from(BUCKET).list(`schools/${maker.ctx.profile.schoolId}/fee-receipts/${verifiedId}`);
    expect((data ?? []).map((o) => o.name)).toHaveLength(1);
  });

  it("the database refuses to re-point the receipt reference (direct API)", async () => {
    for (const actor of [maker, checker]) {
      const swap = await actor.db
        .from("fee_payment_records")
        .update({ receipt_path: `${verifiedPath.slice(0, verifiedPath.lastIndexOf("/"))}/other.pdf`, receipt_name: "other.pdf" })
        .eq("id", verifiedId);
      expect(swap.error?.code).toBe("SF001");
    }
    expect(await receiptPathOf(verifiedId)).toBe(verifiedPath);
  });

  it("Storage refuses to overwrite, move or delete the verified file with a user session", async () => {
    for (const actor of [maker, checker]) {
      const upsert = await actor.db.storage.from(BUCKET).upload(verifiedPath, new TextEncoder().encode("%PDF-1.4\n% forged\n"), {
        contentType: "application/pdf",
        upsert: true,
      });
      expect(upsert.error).not.toBeNull();
      const update = await actor.db.storage.from(BUCKET).update(verifiedPath, new TextEncoder().encode("%PDF-1.4\n% forged\n"), {
        contentType: "application/pdf",
      });
      expect(update.error).not.toBeNull();
      const moved = await actor.db.storage.from(BUCKET).move(verifiedPath, `${verifiedPath}.moved`);
      expect(moved.error).not.toBeNull();
      const removed = await actor.db.storage.from(BUCKET).remove([verifiedPath]);
      expect(removed.data ?? []).toHaveLength(0);
    }
    // The stored bytes are still the original receipt.
    expect(await stored(verifiedPath)).toEqual(original);
    expect(await stored(`${verifiedPath}.moved`)).toBeNull();
  });

  it("no new file can be added to a verified payment's folder; the app shows a permission error", async () => {
    const folder = verifiedPath.slice(0, verifiedPath.lastIndexOf("/"));
    await expect(
      uploadToBucket(maker.db, BUCKET, `${folder}/extra.pdf`, new TextEncoder().encode("%PDF-1.4").buffer, "application/pdf"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await stored(`${folder}/extra.pdf`)).toBeNull();
  });

  it("signed download links for the verified receipt still work", async () => {
    const url = await getPaymentReceiptUrl(maker.db, maker.ctx, verifiedId);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(original);
  });

  it("before verification a receipt can be replaced, and only the replaced (unreferenced) file can be deleted", async () => {
    const { id } = await recordPayment(maker.db, maker.ctx, feeId, { amount: 50, paidOn: "2026-10-12", mode: "CASH" });
    payments.push(id);
    await setPaymentReceipt(maker.db, maker.ctx, id, pdf("first"));
    const first = (await receiptPathOf(id))!;
    objects.push(first);
    await setPaymentReceipt(maker.db, maker.ctx, id, pdf("second"));
    const second = (await receiptPathOf(id))!;
    objects.push(second);
    expect(second).not.toBe(first);

    const removeCurrent = await maker.db.storage.from(BUCKET).remove([second]);
    expect(removeCurrent.data ?? []).toHaveLength(0);
    expect(await stored(second)).not.toBeNull();
    const removeOld = await maker.db.storage.from(BUCKET).remove([first]);
    expect((removeOld.data ?? []).map((o) => o.name)).toEqual([first]);
    expect(await stored(first)).toBeNull();
  });

  it("Storage rejections reach the user as readable messages (size, type)", async () => {
    const { id } = await recordPayment(maker.db, maker.ctx, feeId, { amount: 25, paidOn: "2026-10-12", mode: "CASH" });
    payments.push(id);
    const folder = `schools/${maker.ctx.profile.schoolId}/fee-receipts/${id}`;
    await expect(uploadToBucket(maker.db, BUCKET, `${folder}/big.pdf`, new Uint8Array(4_000_001).buffer, "application/pdf")).rejects.toThrow(
      "The file is too large for this upload.",
    );
    await expect(uploadToBucket(maker.db, BUCKET, `${folder}/x.html`, new TextEncoder().encode("<b>x</b>").buffer, "text/html")).rejects.toThrow(
      "This file type is not allowed.",
    );
  });
});
