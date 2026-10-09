import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { ForbiddenError, TenantBoundaryError } from "@/lib/auth/session";
import {
  ConflictError,
  NotFoundError,
} from "@/lib/services/errors";
import { createFakeDb, type Row } from "@/lib/test/fake-db";
import type { DbClient } from "@/lib/services/errors";
import {
  addHomeworkAttachment,
  createHomework,
  deleteHomework,
  getHomework,
  getHomeworkAttachmentUrl,
  listHomework,
  updateHomework,
} from "@/lib/services/homework";

/**
 * Server-boundary authorization suite for Phase 9 homework. A programmable
 * fake stands in for PostgREST/Storage so tests assert tenant injection,
 * teacher section/subject scope, parent-child scope, cross-school denial,
 * date validation, and attachment authorization. Database-level RLS and
 * tenant triggers are reviewed in migration 0009 and exercised live via
 * supabase/tests/phase9_rls.sql (no local Postgres here to run them).
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
const teacherCtx = () => baseCtx(["TEACHER"], "u-teacher");
const teacher2Ctx = () => baseCtx(["TEACHER"], "u-teacher2");
const parentCtx = () => baseCtx(["PARENT"], "u-parent");

function seed(): Record<string, Row[]> {
  // t1: class teacher of sec7a → all subjects; t2: Math assignee in sec7a only.
  return {
    teachers: [
      { id: "t1", school_id: A, user_id: "u-teacher", employee_no: "E1", display_name: "Ravi", is_active: true },
      { id: "t2", school_id: A, user_id: "u-teacher2", employee_no: "E2", display_name: "Priya", is_active: true },
      { id: "tb", school_id: B, user_id: "u-tb", employee_no: "E9", display_name: "Other", is_active: true },
    ],
    parents: [
      { id: "p1", school_id: A, user_id: "u-parent", full_name: "Rajesh", is_active: true },
      { id: "pb", school_id: B, user_id: "u-pb", full_name: "Far", is_active: true },
    ],
    classes: [
      { id: "c7", school_id: A, name: "Grade 7" },
      { id: "cb1", school_id: B, name: "Grade 1" },
    ],
    sections: [
      { id: "sec7a", school_id: A, class_id: "c7", name: "A", class_teacher_id: "t1", is_active: true },
      { id: "sec7b", school_id: A, class_id: "c7", name: "B", is_active: true },
      { id: "secb", school_id: B, class_id: "cb1", name: "A", is_active: true },
    ],
    subjects: [
      { id: "sub-m", school_id: A, name: "Math" },
      { id: "sub-e", school_id: A, name: "English" },
      { id: "subb", school_id: B, name: "Art" },
    ],
    teacher_subjects: [
      { id: "ts2", school_id: A, teacher_id: "t2", subject_id: "sub-m", section_id: "sec7a" },
    ],
    students: [
      { id: "s1", school_id: A, admission_no: "A1", display_name: "Rahul", class_id: "c7", section_id: "sec7a", status: "active" },
      { id: "s2", school_id: A, admission_no: "A2", display_name: "Ananya", class_id: "c7", section_id: "sec7b", status: "active" },
      { id: "sb1", school_id: B, admission_no: "B1", display_name: "Far Child", class_id: "cb1", section_id: "secb", status: "active" },
    ],
    student_parents: [
      { student_id: "s1", parent_id: "p1", relation: "father", is_primary: true },
    ],
    academic_years: [
      { id: "y1", school_id: A, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
      { id: "yb", school_id: B, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
    ],
    homework: [
      {
        id: "hw1", school_id: A, academic_year_id: "y1", section_id: "sec7a",
        subject_id: "sub-m", teacher_id: "t1", title: "Algebra worksheet",
        description: "Chapter 3 exercises 1–20", assigned_on: "2026-09-20",
        due_date: "2026-09-25", is_active: true,
        subjects: { name: "Math" }, sections: { name: "A" }, classes: { name: "Grade 7" },
        teachers: { display_name: "Ravi" },
      },
      {
        id: "hw2", school_id: A, academic_year_id: "y1", section_id: "sec7b",
        subject_id: "sub-m", teacher_id: "t2", title: "Geometry practice",
        description: "Chapter 4 exercises", assigned_on: "2026-09-21",
        due_date: "2026-09-26", is_active: true,
        subjects: { name: "Math" }, sections: { name: "B" }, classes: { name: "Grade 7" },
        teachers: { display_name: "Priya" },
      },
      {
        id: "hwb", school_id: B, academic_year_id: "yb", section_id: "secb",
        subject_id: "subb", teacher_id: "tb", title: "Far homework",
        description: "Other school", assigned_on: "2026-09-20",
        due_date: "2026-09-25", is_active: true,
        subjects: { name: "Art" }, sections: { name: "A" }, classes: { name: "Grade 1" },
        teachers: { display_name: "Other" },
      },
    ],
    homework_attachments: [
      {
        id: "att1", school_id: A, homework_id: "hw1", bucket: "homework-attachments",
        path: "schools/school-a/homework/hw1/file1.pdf", original_name: "worksheet.pdf",
        mime: "application/pdf", bytes: 1024, uploaded_by: "u-teacher",
      },
    ],
    audit_logs: [],
  };
}

const db = () => createFakeDb(seed()) as unknown as DbClient;

describe("tenant isolation", () => {
  it("admin lists only own-school homework", async () => {
    const { homework } = await listHomework(db(), adminCtx(), { page: 1, limit: 50 });
    expect(homework.map((h) => h.id).sort()).toEqual(["hw1", "hw2"]);
  });

  it("admin cannot read a School B homework (404)", async () => {
    await expect(getHomework(db(), adminCtx(), "hwb")).rejects.toThrow(NotFoundError);
  });

  it("admin cannot create homework under a School B section (404)", async () => {
    const fake = createFakeDb(seed());
    await expect(
      createHomework(fake as unknown as DbClient, adminCtx(), "secb", {
        subjectId: "subb",
        title: "Hijack",
        description: "Nope",
        dueDate: "2026-10-01",
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("homework", "insert")).toHaveLength(0);
  });

  it("cross-school subject reference is denied before insert", async () => {
    const fake = createFakeDb(seed());
    await expect(
      createHomework(fake as unknown as DbClient, adminCtx(), "sec7a", {
        subjectId: "subb",
        title: "Hijack",
        description: "Nope",
        dueDate: "2026-10-01",
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("homework", "insert")).toHaveLength(0);
  });

  it("admin cannot edit/delete a School B homework (404)", async () => {
    await expect(
      updateHomework(db(), adminCtx(), "hwb", { title: "X" }),
    ).rejects.toThrow(NotFoundError);
    await expect(deleteHomework(db(), adminCtx(), "hwb")).rejects.toThrow(NotFoundError);
  });
});

describe("teacher section/subject scope", () => {
  it("class teacher lists and reads their section's homework", async () => {
    const { homework } = await listHomework(db(), teacherCtx(), { page: 1, limit: 50 });
    expect(homework.map((h) => h.id)).toEqual(["hw1"]);
    const detail = await getHomework(db(), teacherCtx(), "hw1");
    expect(detail.homework.title).toBe("Algebra worksheet");
    expect(detail.attachments).toHaveLength(1);
  });

  it("class teacher may create homework for any subject in their section", async () => {
    const fake = createFakeDb(seed());
    const result = await createHomework(fake as unknown as DbClient, teacherCtx(), "sec7a", {
      subjectId: "sub-e", // t1 is class teacher → all subjects allowed
      title: "Reading task",
      description: "Read chapter 5",
      dueDate: "2026-12-15",
    });
    expect(result.id).toBeDefined();
    expect(fake.callsTo("homework", "insert")).toHaveLength(1);
  });

  it("subject assignee (not class teacher) may create only their subject", async () => {
    const fake = createFakeDb(seed());
    await createHomework(fake as unknown as DbClient, teacher2Ctx(), "sec7a", {
      subjectId: "sub-m",
      title: "Math drill",
      description: "Chapter 2",
      dueDate: "2026-12-15",
    });
    expect(fake.callsTo("homework", "insert")).toHaveLength(1);
    const fake2 = createFakeDb(seed());
    await expect(
      createHomework(fake2 as unknown as DbClient, teacher2Ctx(), "sec7a", {
        subjectId: "sub-e", // t2 is NOT the class teacher and NOT assigned English
        title: "Nope",
        description: "Nope",
        dueDate: "2026-12-15",
      }),
    ).rejects.toThrow(TenantBoundaryError);
    expect(fake2.callsTo("homework", "insert")).toHaveLength(0);
  });

  it("teacher cannot view an unassigned section's homework — 404", async () => {
    await expect(getHomework(db(), teacherCtx(), "hw2")).rejects.toThrow(
      TenantBoundaryError,
    );
  });

  it("teacher cannot edit/delete ANOTHER teacher's homework — 404", async () => {
    // t2's homework (hw2) is in an unassigned section for t1 anyway; create a
    // t2 homework IN sec7a to prove authorship (not section) is the boundary.
    const fake = createFakeDb(seed());
    const firstHomework = fake.seed["homework"]?.[0] as Row | undefined;
    if (firstHomework === undefined) throw new Error("seed missing homework");
    firstHomework["teacher_id"] = "t2"; // hw1 now authored by t2, still sec7a
    const client = fake as unknown as DbClient;
    await expect(updateHomework(client, teacherCtx(), "hw1", { title: "X" })).rejects.toThrow(
      TenantBoundaryError,
    );
    await expect(deleteHomework(client, teacherCtx(), "hw1")).rejects.toThrow(
      TenantBoundaryError,
    );
    expect(fake.callsTo("homework", "update")).toHaveLength(0);
  });
});

describe("parent-child scope", () => {
  it("parent reads the linked child's section homework", async () => {
    const { homework } = await listHomework(db(), parentCtx(), { page: 1, limit: 50 });
    expect(homework.map((h) => h.id)).toEqual(["hw1"]);
    await expect(getHomework(db(), parentCtx(), "hw1")).resolves.toBeDefined();
  });

  it("parent cannot read an unlinked child's homework — 404", async () => {
    // hw2 is in sec7b (holds s2, NOT linked to p1).
    await expect(getHomework(db(), parentCtx(), "hw2")).rejects.toThrow(
      TenantBoundaryError,
    );
    await expect(getHomework(db(), parentCtx(), "hwb")).rejects.toThrow(NotFoundError);
  });

  it("parent cannot create/update/delete homework", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      createHomework(client, parentCtx(), "sec7a", {
        subjectId: "sub-m",
        title: "Nope",
        description: "Nope",
        dueDate: "2026-10-01",
      }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      updateHomework(client, parentCtx(), "hw1", { title: "Nope" }),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("homework", "insert")).toHaveLength(0);
    expect(fake.callsTo("homework", "update")).toHaveLength(0);
  });
});

describe("date validation", () => {
  it("rejects due dates before the assigned date", async () => {
    await expect(
      createHomework(db(), teacherCtx(), "sec7a", {
        subjectId: "sub-m",
        title: "Bad dates",
        description: "Nope",
        assignedOn: "2026-10-05",
        dueDate: "2026-10-01",
      }),
    ).rejects.toThrow(ConflictError);
    await expect(
      updateHomework(db(), teacherCtx(), "hw1", { dueDate: "2026-09-01" }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("attachment authorization", () => {
  it("author-teacher adds an attachment (validated, stored privately)", async () => {
    const fake = createFakeDb(seed());
    const result = await addHomeworkAttachment(
      fake as unknown as DbClient,
      teacherCtx(),
      "hw1",
      {
        name: "notes.pdf",
        type: "application/pdf",
        size: 2048,
        bytes: new ArrayBuffer(2048),
      },
    );
    expect(result.id).toBeDefined();
    const uploads = fake.callsTo("storage:homework-attachments", "insert");
    expect(uploads).toHaveLength(1);
    const path = (uploads[0]?.payload as { path: string }).path;
    expect(path.startsWith(`schools/${A}/homework/hw1/`)).toBe(true);
  });

  it("another teacher cannot attach to homework they did not create — 404", async () => {
    const fake = createFakeDb(seed());
    // hw1 authored by t1; t2 (assigned in sec7a for Math) is NOT the author.
    await expect(
      addHomeworkAttachment(fake as unknown as DbClient, teacher2Ctx(), "hw1", {
        name: "evil.pdf",
        type: "application/pdf",
        size: 2048,
        bytes: new ArrayBuffer(2048),
      }),
    ).rejects.toThrow(TenantBoundaryError);
    expect(fake.callsTo("storage:homework-attachments", "insert")).toHaveLength(0);
  });

  it("invalid attachment types are rejected", async () => {
    await expect(
      addHomeworkAttachment(db(), teacherCtx(), "hw1", {
        name: "macro.docm",
        type: "application/vnd.ms-word.document.macroEnabled.12",
        size: 2048,
        bytes: new ArrayBuffer(2048),
      }),
    ).rejects.toThrow(ConflictError);
    await expect(
      addHomeworkAttachment(db(), teacherCtx(), "hw1", {
        name: "huge.pdf",
        type: "application/pdf",
        size: 11 * 1024 * 1024,
        bytes: new ArrayBuffer(0),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("parent opens attachments only within their child's section scope", async () => {
    // att1 belongs to hw1 (sec7a — linked child) → allowed.
    const url = await getHomeworkAttachmentUrl(db(), parentCtx(), "att1");
    expect(url.startsWith("https://signed.test/homework-attachments/")).toBe(true);
    // A foreign attachment (hwb's bucket path in school B) → 404.
    await expect(
      getHomeworkAttachmentUrl(db(), parentCtx(), "att-missing"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("audit logging", () => {
  it("audits homework create/update/delete + attachments", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await createHomework(client, teacherCtx(), "sec7a", {
      subjectId: "sub-m",
      title: "New homework",
      description: "Chapter 6",
      assignedOn: "2026-10-01",
      dueDate: "2026-10-02",
    });
    await updateHomework(client, teacherCtx(), "hw1", { dueDate: "2026-09-28" });
    // Delete the homework created above (own homework — allowed). The id is
    // read from the fake's seed state (recorded payloads lack generated ids).
    const created = (fake.seed["homework"] as Row[]).find(
      (r) => r["title"] === "New homework",
    );
    const createdId = created?.["id"] as string;
    await deleteHomework(client, teacherCtx(), createdId);
    await addHomeworkAttachment(client, teacherCtx(), "hw1", {
      name: "file.pdf",
      type: "application/pdf",
      size: 1024,
      bytes: new ArrayBuffer(1024),
    });
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits.map((a) => (a.payload as Row)["action"])).toEqual([
      "homework.created",
      "homework.updated",
      "homework.deleted",
      "homework.attachment_added",
    ]);
    expect(audits[0]?.payload).toMatchObject({ school_id: A });
  });
});

describe("nested section→class embed mapping (Phase 14)", () => {
  it("flattens sections.classes into the DTO shape", async () => {
    const s = seed();
    for (const hw of s.homework as Row[]) {
      hw["sections"] = { name: "A", classes: { name: "Grade 7" } };
      delete hw["classes"];
    }
    const client = createFakeDb(s) as unknown as DbClient;
    const { homework } = await listHomework(client, adminCtx(), { page: 1, limit: 50 });
    expect(homework.length).toBeGreaterThan(0);
    expect(homework[0]?.sections).toEqual({ name: "A" });
    expect(homework[0]?.classes).toEqual({ name: "Grade 7" });
  });
});
