import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/auth/session";
import {
  ConflictError,
  NotFoundError,
} from "@/lib/services/errors";
import { createFakeDb, type Row } from "@/lib/test/fake-db";
import type { DbClient } from "@/lib/services/errors";
import {
  createPyq,
  getPyqFileUrl,
  listPyqs,
  setPyqActive,
  updatePyq,
} from "@/lib/services/pyqs";

/**
 * Server-boundary authorization suite for Phase 12 PYQs. Admin manages own
 * school; students/teachers/parents read-only own school; archive =
 * soft-delete; signed URLs only. RLS is in migration 0012.
 */

const A = "school-a";
const B = "school-b";

function baseCtx(
  roles: SessionContext["roles"],
  userId = "u-admin",
): SessionContext {
  return {
    authUserId: `auth-${userId}`,
    profile: {
      id: userId,
      authUserId: `auth-${userId}`,
      schoolId: A,
      email: `${userId}@example.com`,
      fullName: userId,
      phone: null,
      isActive: true,
    },
    school: {
      id: A,
      name: "School A",
      slug: "a",
      timezone: "Asia/Kolkata",
      logoPath: null,
      primaryColor: null,
      isActive: true,
    },
    roles,
  };
}

const adminCtx = () => baseCtx(["SCHOOL_ADMIN"]);
const studentCtx = () => baseCtx(["STUDENT"], "u-student");
const teacherCtx = () => baseCtx(["TEACHER"], "u-teacher");

function seed(): Record<string, Row[]> {
  return {
    teachers: [],
    parents: [],
    users: [
      { id: "u-admin", school_id: A, email: "a@a.example", full_name: "Admin", is_active: true },
      { id: "u-student", school_id: A, email: "s@a.example", full_name: "Sonia", is_active: true },
      { id: "u-admin-b", school_id: B, email: "ab@b.example", full_name: "AdminB", is_active: true },
    ],
    user_roles: [
      { user_id: "u-admin", role: "SCHOOL_ADMIN" },
      { user_id: "u-admin-b", role: "SCHOOL_ADMIN" },
    ],
    classes: [
      { id: "c7", school_id: A, name: "Grade 7" },
      { id: "cb1", school_id: B, name: "Grade 1" },
    ],
    sections: [],
    subjects: [
      { id: "sub-m", school_id: A, name: "Math" },
      { id: "subb", school_id: B, name: "Art" },
    ],
    teacher_subjects: [],
    students: [],
    student_parents: [],
    academic_years: [],
    student_enrollments: [],
    exams: [],
    exam_subjects: [],
    marks: [],
    grading_systems: [],
    grading_rules: [],
    attendance_sessions: [],
    attendance_records: [],
    timetable_slots: [],
    homework: [],
    homework_attachments: [],
    notices: [],
    notice_targets: [],
    notifications: [],
    student_fees: [],
    fee_payment_records: [],
    report_cards: [],
    pyqs: [
      {
        id: "pyq1", school_id: A, class_id: "c7", subject_id: "sub-m",
        year_label: "2025", exam_board_name: "CBSE Board 2024", title: "Maths 2025",
        file_bucket: "pyqs", file_path: "schools/school-a/pyqs/c7/paper.pdf",
        file_name: "paper.pdf", file_mime: "application/pdf", file_bytes: 1024,
        solution_bucket: "pyqs", solution_path: "schools/school-a/pyqs/c7/solution.pdf",
        solution_name: "solution.pdf", solution_mime: "application/pdf", solution_bytes: 2048,
        answer_key_path: null, answer_key_name: null,
        uploaded_by: "u-admin", is_active: true, created_at: "2026-09-20T10:00:00Z",
        classes: { name: "Grade 7" }, subjects: { name: "Math" },
      },
      {
        id: "pyq2", school_id: A, class_id: "c7", subject_id: "sub-m",
        year_label: "2024", exam_board_name: "State Board 2024", title: null,
        file_bucket: "pyqs", file_path: "schools/school-a/pyqs/c7/2024.pdf",
        file_name: "2024.pdf", file_mime: "application/pdf", file_bytes: 1024,
        solution_bucket: null, solution_path: null, solution_name: null,
        solution_mime: null, solution_bytes: null,
        answer_key_path: null, answer_key_name: null,
        uploaded_by: "u-admin", is_active: false, created_at: "2026-09-19T10:00:00Z",
        classes: { name: "Grade 7" }, subjects: { name: "Math" },
      },
      {
        id: "pyqb", school_id: B, class_id: "cb1", subject_id: "subb",
        year_label: "2025", exam_board_name: "Other Board", title: null,
        file_bucket: "pyqs", file_path: "schools/school-b/pyqs/x.pdf",
        file_name: "x.pdf", file_mime: "application/pdf", file_bytes: 1024,
        solution_bucket: null, solution_path: null, solution_name: null,
        solution_mime: null, solution_bytes: null,
        answer_key_path: null, answer_key_name: null,
        uploaded_by: "u-admin-b", is_active: true, created_at: "2026-09-20T10:00:00Z",
        classes: { name: "Grade 1" }, subjects: { name: "Art" },
      },
    ],
    audit_logs: [],
  };
}

const db = () => createFakeDb(seed()) as unknown as DbClient;

function paper(size = 1024) {
  return { name: "paper.pdf", type: "application/pdf", size, bytes: new ArrayBuffer(size) };
}

describe("admin upload authorization", () => {
  it("admin creates a PYQ (validated, private bucket, audited)", async () => {
    const fake = createFakeDb(seed());
    const result = await createPyq(
      fake as unknown as DbClient,
      adminCtx(),
      {
        classId: "c7",
        subjectId: "sub-m",
        yearLabel: "2023",
        examBoardName: "ICSE Board 2023",
        title: "Maths 2023",
      },
      { file: paper(), solution: paper(2048), answerKey: null },
    );
    expect(result.id).toBeDefined();
    const uploads = fake.callsTo("storage:pyqs", "insert");
    expect(uploads).toHaveLength(2); // question + solution
    const path = (uploads[0]?.payload as { path: string }).path;
    expect(path.startsWith(`schools/${A}/pyqs/`)).toBe(true);
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits[0]?.payload).toMatchObject({ action: "pyq.created", school_id: A });
  });

  it("non-admins cannot upload (admin-only)", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      createPyq(
        client,
        studentCtx(),
        { classId: "c7", subjectId: "sub-m", yearLabel: "2023", examBoardName: "X" },
        { file: paper() },
      ),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      createPyq(
        client,
        teacherCtx(),
        { classId: "c7", subjectId: "sub-m", yearLabel: "2023", examBoardName: "X" },
        { file: paper() },
      ),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("storage:pyqs", "insert")).toHaveLength(0);
  });

  it("invalid files are rejected; cross-school class/subject denied", async () => {
    await expect(
      createPyq(
        db(),
        adminCtx(),
        { classId: "c7", subjectId: "sub-m", yearLabel: "2023", examBoardName: "X" },
        {
          file: {
            name: "evil.exe",
            type: "application/x-msdownload",
            size: 1024,
            bytes: new ArrayBuffer(1024),
          },
        },
      ),
    ).rejects.toThrow(ConflictError);
    const fake = createFakeDb(seed());
    await expect(
      createPyq(
        fake as unknown as DbClient,
        adminCtx(),
        { classId: "cb1", subjectId: "sub-m", yearLabel: "2023", examBoardName: "X" },
        { file: paper() },
      ),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("storage:pyqs", "insert")).toHaveLength(0);
  });
});

describe("student read authorization", () => {
  it("students browse their school's bank with filters", async () => {
    const client = db();
    const { pyqs } = await listPyqs(client, studentCtx(), { page: 1, limit: 50 });
    // Archived pyq2 + foreign pyqb excluded.
    expect(pyqs.map((p) => p.id)).toEqual(["pyq1"]);
    const filtered = await listPyqs(client, studentCtx(), {
      yearLabel: "2025",
      page: 1,
      limit: 50,
    });
    expect(filtered.pyqs.map((p) => p.id)).toEqual(["pyq1"]);
  });

  it("cross-school denial (404)", async () => {
    await expect(getPyqFileUrl(db(), studentCtx(), "pyqb", "question")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("signed URLs for question/solution; missing answer key → 404", async () => {
    const url = await getPyqFileUrl(db(), studentCtx(), "pyq1", "question");
    expect(url.startsWith("https://signed.test/pyqs/")).toBe(true);
    const solution = await getPyqFileUrl(db(), studentCtx(), "pyq1", "solution");
    expect(solution.startsWith("https://signed.test/pyqs/")).toBe(true);
    await expect(getPyqFileUrl(db(), studentCtx(), "pyq1", "answerKey")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("archived PYQs are not downloadable (404)", async () => {
    await expect(getPyqFileUrl(db(), studentCtx(), "pyq2", "question")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("metadata + archive behavior", () => {
  it("admin edits metadata (audited)", async () => {
    const fake = createFakeDb(seed());
    await updatePyq(fake as unknown as DbClient, adminCtx(), "pyq1", {
      title: "Maths 2025 (Rev)",
      yearLabel: "2025",
    });
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits[0]?.payload).toMatchObject({ action: "pyq.updated" });
  });

  it("archive → hidden from feeds + not downloadable; restore works", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await setPyqActive(client, adminCtx(), "pyq1", false);
    const { pyqs } = await listPyqs(client, studentCtx(), { page: 1, limit: 50 });
    expect(pyqs).toEqual([]);
    await expect(getPyqFileUrl(client, studentCtx(), "pyq1", "question")).rejects.toThrow(
      NotFoundError,
    );
    // Restore.
    await setPyqActive(client, adminCtx(), "pyq1", true);
    const { pyqs: restored } = await listPyqs(client, studentCtx(), { page: 1, limit: 50 });
    expect(restored.map((p) => p.id)).toEqual(["pyq1"]);
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits.some((a) => (a.payload as Row)["action"] === "pyq.archived")).toBe(true);
    expect(audits.some((a) => (a.payload as Row)["action"] === "pyq.restored")).toBe(true);
  });

  it("non-admins cannot edit/archive", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      updatePyq(client, studentCtx(), "pyq1", { title: "Hijack" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(setPyqActive(client, teacherCtx(), "pyq1", false)).rejects.toThrow(
      ForbiddenError,
    );
    expect(fake.callsTo("pyqs", "update")).toHaveLength(0);
  });
});
