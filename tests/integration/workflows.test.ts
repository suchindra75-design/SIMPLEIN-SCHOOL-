import { describe, expect, it } from "vitest";
import { getStudentAttendance, getStudentSummary } from "@/lib/services/attendance";
import { listExams } from "@/lib/services/exams";
import { listStudentFees, recordPayment } from "@/lib/services/fees";
import { listMyTimetable } from "@/lib/services/timetable";
import { getMarksGrid, getStudentResult, saveMarks } from "@/lib/services/marks";
import { createNotice, listNotices, setNoticePublished } from "@/lib/services/notices";
import { getStudent, listStudents } from "@/lib/services/students";
import { as, errorName, serviceClient, studentByAdmission } from "./helpers";

/** Portal workflows against the seeded local database, through the real services + RLS. */

async function currentYear(schoolSlug = "greenfield-demo") {
  const db = serviceClient();
  const { data: school } = await db.from("schools").select("id").eq("slug", schoolSlug).single();
  const { data } = await db.from("academic_years").select("id").eq("school_id", school!.id).eq("is_current", true).single();
  return (data as { id: string }).id;
}
async function examId(className: string, name = "Unit Test 1") {
  const db = serviceClient();
  const { data: cls } = await db.from("classes").select("id, school_id").eq("name", className);
  const { data: school } = await db.from("schools").select("id").eq("slug", "greenfield-demo").single();
  const classId = (cls as { id: string; school_id: string }[]).find((c) => c.school_id === school!.id)!.id;
  const { data } = await db.from("exams").select("id").eq("class_id", classId).eq("name", name).single();
  return { examId: (data as { id: string }).id, classId };
}

async function examSubjectId(className: string, subjectName: string) {
  const { examId: exam } = await examId(className);
  const db = serviceClient();
  const { data } = await db.from("exam_subjects").select("id, subjects(name)").eq("exam_id", exam);
  const row = ((data ?? []) as unknown as { id: string; subjects: { name: string } }[]).find(
    (r) => r.subjects.name === subjectName,
  );
  return row!.id;
}

describe("tenant isolation", () => {
  it("each school admin lists only their own school's students", async () => {
    const a = await as("admin");
    const b = await as("otherSchoolAdmin");
    const listA = await listStudents(a.db, a.ctx, { page: 1, limit: 100 });
    const listB = await listStudents(b.db, b.ctx, { page: 1, limit: 100 });
    expect(listA.students.every((s) => !s.admissionNo.startsWith("RDA"))).toBe(true);
    expect(listB.students.map((s) => s.admissionNo).sort()).toEqual(["DUP-100", "RDA-2026-001"]);
  });

  it("an admin cannot open another school's student by id", async () => {
    const b = await as("otherSchoolAdmin");
    const aarav = await studentByAdmission("GPS-2026-001");
    expect(await errorName(() => getStudent(b.db, b.ctx, aarav.id))).not.toBe("none");
  });

  it("a parent can open their own child but not another family's", async () => {
    const parent = await as("parent");
    const aarav = await studentByAdmission("GPS-2026-001");
    const sneha = await studentByAdmission("GPS-2026-006");
    expect((await getStudent(parent.db, parent.ctx, aarav.id)).student.admissionNo).toBe("GPS-2026-001");
    expect(await errorName(() => getStudent(parent.db, parent.ctx, sneha.id))).not.toBe("none");
  });
});

describe("notices reach their audience", () => {
  const titles = async (role: Parameters<typeof as>[0]) => {
    const actor = await as(role);
    const { notices } = await listNotices(actor.db, actor.ctx, { page: 1, limit: 50, includeInactive: true });
    return notices.map((n) => n.title);
  };

  it("school-wide notices are visible to parents, students and teachers", async () => {
    for (const role of ["parent", "student", "teacher"] as const) {
      expect(await titles(role)).toContain("Parent–Teacher Meeting on Saturday");
    }
  });

  it("a section notice reaches that section's families only", async () => {
    expect(await titles("parent")).toContain("Grade 9-A science lab visit"); // Aarav is in 9-A
    expect(await titles("parent2")).not.toContain("Grade 9-A science lab visit"); // Sneha is in 9-B
  });

  it("teacher-only notices are hidden from families", async () => {
    expect(await titles("teacher")).toContain("Staff meeting: exam duty roster");
    expect(await titles("parent")).not.toContain("Staff meeting: exam duty roster");
  });

  it("drafts are never shown to non-admins, even when they ask for inactive notices", async () => {
    for (const role of ["parent", "student", "teacher"] as const) {
      expect(await titles(role)).not.toContain("Annual day (draft)");
    }
  });

  it("other schools' notices never appear", async () => {
    expect(await titles("parent")).not.toContain("Riverside sports day");
  });

  it("a section-targeted draft stays hidden from that section until published", async () => {
    const admin = await as("admin");
    const parent = await as("parent"); // Aarav is in 9-A
    const aarav = await studentByAdmission("GPS-2026-001");
    const title = `Integration draft ${Date.now()}`;
    const { id } = await createNotice(admin.db, admin.ctx, {
      title,
      content: "Draft for 9-A only.",
      category: "SECTION",
      // The admin form posts both ids; only the section must be stored.
      audience: { type: "SECTION", classId: aarav.class_id, sectionId: aarav.section_id },
    });
    try {
      expect(await titles("parent")).not.toContain(title);
      const direct = await parent.db.from("notices").select("id").eq("id", id);
      expect(direct.data).toEqual([]);

      await setNoticePublished(admin.db, admin.ctx, id, true);
      expect(await titles("parent")).toContain(title);
      expect(await titles("parent2")).not.toContain(title); // 9-B family
    } finally {
      await serviceClient().from("notices").delete().eq("id", id);
    }
  });

  it("a school-wide notice created in the app reaches parents once published", async () => {
    const admin = await as("admin");
    const title = `Integration school notice ${Date.now()}`;
    const { id } = await createNotice(admin.db, admin.ctx, {
      title,
      content: "For everyone.",
      category: "GENERAL",
      audience: { type: "SCHOOL" },
    });
    try {
      await setNoticePublished(admin.db, admin.ctx, id, true);
      expect(await titles("parent2")).toContain(title);
    } finally {
      await serviceClient().from("notices").delete().eq("id", id);
    }
  });
});

describe("notification inboxes", () => {
  it("a teacher cannot insert a notification into another school's inbox", async () => {
    const teacher = await as("teacher");
    const db = serviceClient();
    const { data: riya } = await db.from("users").select("id, school_id").eq("email", "riya.bose@riverside.test").single();
    const title = `cross-school probe ${Date.now()}`;
    const { error } = await teacher.db.from("notifications").insert({
      school_id: teacher.ctx.profile.schoolId,
      user_id: riya!.id,
      type: "ACCOUNT",
      title,
    });
    expect(error).not.toBeNull();
    const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("title", title);
    expect(count).toBe(0);
  });
});

describe("attendance history in family portals", () => {
  it("a parent sees dated attendance records for their child, newest first", async () => {
    const parent = await as("parent");
    const aarav = await studentByAdmission("GPS-2026-001");
    const { records } = await getStudentAttendance(parent.db, parent.ctx, aarav.id, { page: 1, limit: 50 });
    expect(records.length).toBe(5);
    const dates = records.map((r) => r.date);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("a student's date-range filter limits the records and the summary", async () => {
    const student = await as("student");
    const aarav = await studentByAdmission("GPS-2026-001");
    const all = await getStudentAttendance(student.db, student.ctx, aarav.id, { page: 1, limit: 50 });
    const newest = all.records[0]!.date;
    const ranged = await getStudentAttendance(student.db, student.ctx, aarav.id, { from: newest, to: newest, page: 1, limit: 50 });
    expect(ranged.records.map((r) => r.date)).toEqual([newest]);
    expect(ranged.total).toBe(1);
    const summary = await getStudentSummary(student.db, student.ctx, aarav.id, { from: newest, to: newest });
    expect(summary.total).toBe(1);
  });
});

describe("family fee views (read-only)", () => {
  it("a parent and the student both see verified payments", async () => {
    const aarav = await studentByAdmission("GPS-2026-001");
    for (const role of ["parent", "student"] as const) {
      const actor = await as(role);
      const { fees } = await listStudentFees(actor.db, actor.ctx, aarav.id);
      expect(fees[0]!.paid).toBe(25000);
    }
  });

  it("a parent cannot record a payment", async () => {
    const parent = await as("parent");
    const aarav = await studentByAdmission("GPS-2026-001");
    const db = serviceClient();
    const { data: fee } = await db.from("student_fees").select("id").eq("student_id", aarav.id).single();
    expect(
      await errorName(() => recordPayment(parent.db, parent.ctx, fee!.id, { amount: 1, paidOn: "2026-10-01", mode: "CASH" })),
    ).not.toBe("none");
  });
});

describe("timetable views", () => {
  it("a student's timetable shows subject and teacher names", async () => {
    const student = await as("student");
    const { slots } = await listMyTimetable(student.db, student.ctx);
    expect(slots.length).toBe(25);
    expect(JSON.stringify(slots)).toContain("Anita Verma");
  });
});

describe("exam schedules", () => {
  it("teacher and student exam lists include each exam's subjects", async () => {
    for (const role of ["teacher", "student"] as const) {
      const actor = await as(role);
      const { exams } = await listExams(actor.db, actor.ctx, { page: 1, limit: 50, withSubjects: true });
      const ut9 = exams.find((e) => e.name === "Unit Test 1" && e.classes?.name === "Grade 9")!;
      expect(ut9.subjects?.map((s) => s.subjects?.name).sort()).toEqual(["English", "Mathematics", "Science"]);
    }
  });
});

describe("exam results", () => {
  it("students see published subjects only", async () => {
    const student = await as("student");
    const aarav = await studentByAdmission("GPS-2026-001");
    const { examId: ut9 } = await examId("Grade 9");
    const result = await getStudentResult(student.db, student.ctx, aarav.id, ut9);
    const subjects = result.subjects.map((s) => s.subjectName);
    expect(subjects).toContain("Mathematics");
    expect(subjects).not.toContain("Science");
  });

  it("a teacher's marks grid and saves cover only the sections they may mark", async () => {
    // Anita is class teacher of 9-A (all subjects there) and does not teach
    // Science in 9-B, so her Science grid is 9-A only (Sneha is in 9-B).
    const rahul = await as("teacher");
    const sci = await examSubjectId("Grade 9", "Science");
    const grid = await getMarksGrid(rahul.db, rahul.ctx, sci);
    const names = grid.roster.map((r) => r.displayName);
    expect(names).toContain("Aarav Sharma");
    expect(names).not.toContain("Sneha Nair");
    const sneha = await studentByAdmission("GPS-2026-006");
    expect(grid.marks.some((m) => m.studentId === sneha.id)).toBe(false);
    expect(
      await errorName(() =>
        saveMarks(rahul.db, rahul.ctx, sci, { records: [{ studentId: sneha.id, marksObtained: 1, isAbsent: false }] }),
      ),
    ).toBe("ConflictError");
  });

  it("a batch save keeps the original author on existing marks", async () => {
    const admin = await as("admin");
    const anita = await as("teacher"); // class teacher of 9-A → may enter every 9-A subject
    const eng = await examSubjectId("Grade 9", "English");
    const aarav = await studentByAdmission("GPS-2026-001");
    const ananya = await studentByAdmission("GPS-2026-002");
    const db = serviceClient();
    try {
      await saveMarks(admin.db, admin.ctx, eng, { records: [{ studentId: aarav.id, marksObtained: 40, isAbsent: false }] });
      await saveMarks(anita.db, anita.ctx, eng, {
        records: [
          { studentId: aarav.id, marksObtained: 41, isAbsent: false },
          { studentId: ananya.id, marksObtained: 35, isAbsent: false },
        ],
      });
      const { data } = await db.from("marks").select("student_id, marks_obtained, entered_by, updated_by").eq("exam_subject_id", eng);
      const byStudent = new Map((data ?? []).map((m) => [m.student_id, m]));
      expect(byStudent.get(aarav.id)).toMatchObject({ marks_obtained: 41, entered_by: admin.ctx.profile.id, updated_by: anita.ctx.profile.id });
      expect(byStudent.get(ananya.id)).toMatchObject({ entered_by: anita.ctx.profile.id });
    } finally {
      await db.from("marks").delete().eq("exam_subject_id", eng);
    }
  });
});
