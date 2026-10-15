import { describe, expect, it } from "vitest";
import { listStudentFees, recordPayment, verifyPaymentRecord, voidPaymentRecord } from "@/lib/services/fees";
import { previewPromotion, promoteStudents } from "@/lib/services/promotions";
import { createAcademicYear, listAcademicYears, setCurrentAcademicYear } from "@/lib/services/years";
import { as, schoolId, serviceClient, studentByAdmission } from "./helpers";

/** Admin workflows that change data; every test restores what it touched. */

async function yearIds() {
  const db = serviceClient();
  const school = await schoolId("greenfield-demo");
  const { data } = await db.from("academic_years").select("id, name, is_current").eq("school_id", school);
  return data as { id: string; name: string; is_current: boolean }[];
}
async function removeYear(name: string) {
  const db = serviceClient();
  const school = await schoolId("greenfield-demo");
  const { data } = await db.from("academic_years").select("id").eq("school_id", school).eq("name", name);
  for (const y of (data ?? []) as { id: string }[]) {
    await db.from("student_enrollments").delete().eq("academic_year_id", y.id);
    await db.from("academic_years").delete().eq("id", y.id);
  }
}

describe("academic years", () => {
  it("creating a year marked current switches the current year (one current year)", async () => {
    const admin = await as("admin");
    const before = (await yearIds()).find((y) => y.is_current)!;
    try {
      await createAcademicYear(admin.db, admin.ctx, {
        name: "2030-31",
        startsOn: "2030-04-01",
        endsOn: "2031-03-31",
        isCurrent: true,
      });
      const { academicYears } = await listAcademicYears(admin.db, admin.ctx);
      expect(academicYears.filter((y) => y.isCurrent).map((y) => y.name)).toEqual(["2030-31"]);
    } finally {
      await setCurrentAcademicYear(admin.db, admin.ctx, before.id);
      await removeYear("2030-31");
    }
    expect((await yearIds()).filter((y) => y.is_current).map((y) => y.id)).toEqual([before.id]);
  });

  it("rejects an end date before the start date", async () => {
    const admin = await as("admin");
    await expect(
      createAcademicYear(admin.db, admin.ctx, { name: "Bad", startsOn: "2031-04-01", endsOn: "2031-03-01", isCurrent: false }),
    ).rejects.toThrow(/end date/i);
  });
});

describe("offline fee payments", () => {
  it("record → overpayment blocked → maker-checker verify → void, mirrored read-only for the parent", async () => {
    const admin = await as("admin");
    const accounts = await as("admin2");
    const parent = await as("parent2"); // Sneha's parent
    const sneha = await studentByAdmission("GPS-2026-006");
    const db = serviceClient();
    const { data: fee } = await db.from("student_fees").select("id, total_amount").eq("student_id", sneha.id).single();
    const feeId = (fee as { id: string }).id;
    const created: string[] = [];
    try {
      const first = await recordPayment(admin.db, admin.ctx, feeId, { amount: 20000, paidOn: "2026-10-01", mode: "CASH" });
      created.push(first.id);
      // 20000 pending + 6000 would exceed the 25000 total even before verification.
      await expect(
        recordPayment(admin.db, admin.ctx, feeId, { amount: 6000, paidOn: "2026-10-02", mode: "CASH" }),
      ).rejects.toThrow(/exceeds the outstanding balance/);

      expect((await listStudentFees(parent.db, parent.ctx, sneha.id)).fees[0]!.paid).toBe(0); // pending

      await expect(verifyPaymentRecord(admin.db, admin.ctx, first.id)).rejects.toThrow(/Another admin/);
      await verifyPaymentRecord(accounts.db, accounts.ctx, first.id);
      await expect(verifyPaymentRecord(accounts.db, accounts.ctx, first.id)).rejects.toThrow(/already been verified/);
      const afterVerify = (await listStudentFees(parent.db, parent.ctx, sneha.id)).fees[0]!;
      expect(afterVerify).toMatchObject({ paid: 20000, due: 5000 });

      await voidPaymentRecord(accounts.db, accounts.ctx, first.id, { reason: "Recorded twice by mistake" });
      const afterVoid = (await listStudentFees(parent.db, parent.ctx, sneha.id)).fees[0]!;
      expect(afterVoid).toMatchObject({ paid: 0, due: 25000 });
      expect(afterVoid.records).toEqual([]); // families never see voided records

      await expect(
        recordPayment(parent.db, parent.ctx, feeId, { amount: 1, paidOn: "2026-10-03", mode: "CASH" }),
      ).rejects.toThrow();
    } finally {
      for (const id of created) await db.from("fee_payment_records").delete().eq("id", id);
    }
  });
});

describe("promotions", () => {
  it("promotes into the proposed class and section, never into class NULL", async () => {
    const admin = await as("admin");
    const db = serviceClient();
    const current = (await yearIds()).find((y) => y.is_current)!;
    const rohan = await studentByAdmission("GPS-2026-003");
    const pooja = await studentByAdmission("GPS-2026-004");
    const snapshot = await db
      .from("students")
      .select("id, class_id, section_id, roll_number, status")
      .in("id", [rohan.id, pooja.id]);
    const { id: nextYear } = await createAcademicYear(admin.db, admin.ctx, {
      name: "2027-28",
      startsOn: "2027-04-01",
      endsOn: "2028-03-31",
      isCurrent: false,
    });
    try {
      const preview = await previewPromotion(admin.db, admin.ctx, {
        fromYearId: current.id,
        toYearId: nextYear,
        classId: rohan.class_id,
      });
      const proposal = preview.proposals.find((p) => p.studentId === rohan.id)!;
      expect(proposal.action).toBe("PROMOTE");
      expect(proposal.nextClassId).not.toBeNull();
      const { data: nextSection } = await db
        .from("sections")
        .select("id")
        .eq("class_id", proposal.nextClassId!)
        .eq("name", "A")
        .single();

      const result = await promoteStudents(admin.db, admin.ctx, {
        fromYearId: current.id,
        toYearId: nextYear,
        assignments: [
          // As the page posts it: proposed class + chosen section.
          { studentId: rohan.id, nextClassId: proposal.nextClassId, nextSectionId: nextSection!.id, hold: false },
          // A section without a class id must still land in that section's class.
          { studentId: pooja.id, nextClassId: null, nextSectionId: nextSection!.id, hold: false },
        ],
      });
      expect(result).toMatchObject({ promoted: 2, graduated: 0, failed: [] });

      const { data: moved } = await db
        .from("students")
        .select("id, class_id, section_id, roll_number, status")
        .in("id", [rohan.id, pooja.id]);
      for (const s of moved as { class_id: string | null; section_id: string; roll_number: string | null; status: string }[]) {
        expect(s).toMatchObject({ class_id: proposal.nextClassId, section_id: nextSection!.id, roll_number: null, status: "active" });
      }
      const { count } = await db
        .from("student_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("academic_year_id", nextYear);
      expect(count).toBe(2);
    } finally {
      for (const s of (snapshot.data ?? []) as Record<string, unknown>[]) {
        const { id, ...rest } = s;
        await db.from("students").update(rest).eq("id", id as string);
      }
      await removeYear("2027-28");
    }
  });
});
