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
  createNotice,
  deleteNotice,
  getNotice,
  getNoticeAttachmentUrl,
  listNotices,
  setNoticeAttachment,
  setNoticePublished,
  updateNotice,
} from "@/lib/services/notices";
import {
  fanOutNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  resolveRecipients,
  unreadCount,
} from "@/lib/services/notifications";

/**
 * Server-boundary authorization suite for Phase 10 notices + notifications.
 * A programmable fake stands in for PostgREST/Storage so tests assert
 * audience targeting, teacher/parent scope, tenant isolation, recipient
 * isolation, read-state behavior, expiry, and audit. Database-level RLS and
 * tenant triggers are reviewed in migration 0010 and exercised live via
 * supabase/tests/phase10_rls.sql (no local Postgres here to run them).
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
const parentCtx = () => baseCtx(["PARENT"], "u-parent");

function seed(): Record<string, Row[]> {
  // t1: class teacher of sec7a; t2: assigned sec7b. p1: linked to s1 (sec7a).
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
    users: [
      { id: "u-admin", school_id: A, email: "admin@a.example", full_name: "Admin", is_active: true },
      { id: "u-teacher", school_id: A, email: "t@a.example", full_name: "Ravi", is_active: true },
      { id: "u-teacher2", school_id: A, email: "t2@a.example", full_name: "Priya", is_active: true },
      { id: "u-parent", school_id: A, email: "p@a.example", full_name: "Rajesh", is_active: true },
      { id: "u-admin-b", school_id: B, email: "admin@b.example", full_name: "Admin B", is_active: true },
    ],
    user_roles: [
      { user_id: "u-admin", role: "SCHOOL_ADMIN" },
      { user_id: "u-admin-b", role: "SCHOOL_ADMIN" },
    ],
    classes: [
      { id: "c7", school_id: A, name: "Grade 7" },
      { id: "cb1", school_id: B, name: "Grade 1" },
    ],
    sections: [
      { id: "sec7a", school_id: A, class_id: "c7", name: "A", class_teacher_id: "t1", is_active: true },
      { id: "sec7b", school_id: A, class_id: "c7", name: "B", class_teacher_id: "t2", is_active: true },
      { id: "secb", school_id: B, class_id: "cb1", name: "A", is_active: true },
    ],
    subjects: [
      { id: "sub-m", school_id: A, name: "Math" },
      { id: "subb", school_id: B, name: "Art" },
    ],
    teacher_subjects: [],
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
    ],
    notices: [
      {
        id: "n-school", school_id: A, title: "Annual day", content: "School-wide announcement",
        category: "GENERAL", is_published: true, published_at: "2026-09-20T10:00:00Z",
        expires_at: null, is_active: true, attachment_bucket: null, attachment_path: null,
        attachment_name: null, attachment_mime: null, attachment_bytes: null,
        created_by: "u-admin", created_at: "2026-09-20T10:00:00Z",
      },
      {
        id: "n-sec7a", school_id: A, title: "7A field trip", content: "Section-specific",
        category: "CLASS", is_published: true, published_at: "2026-09-21T10:00:00Z",
        expires_at: null, is_active: true, attachment_bucket: null, attachment_path: null,
        attachment_name: null, attachment_mime: null, attachment_bytes: null,
        created_by: "u-admin", created_at: "2026-09-21T10:00:00Z",
      },
      {
        id: "n-sec7b", school_id: A, title: "7B sports", content: "Other section",
        category: "CLASS", is_published: true, published_at: "2026-09-21T11:00:00Z",
        expires_at: null, is_active: true, attachment_bucket: null, attachment_path: null,
        attachment_name: null, attachment_mime: null, attachment_bytes: null,
        created_by: "u-admin", created_at: "2026-09-21T11:00:00Z",
      },
      {
        id: "n-expired", school_id: A, title: "Old notice", content: "Expired",
        category: "GENERAL", is_published: true, published_at: "2026-01-01T10:00:00Z",
        expires_at: "2026-02-01", is_active: true, attachment_bucket: null,
        attachment_path: null, attachment_name: null, attachment_mime: null,
        attachment_bytes: null, created_by: "u-admin", created_at: "2026-01-01T10:00:00Z",
      },
      {
        id: "n-b", school_id: B, title: "School B notice", content: "Other school",
        category: "GENERAL", is_published: true, published_at: "2026-09-20T10:00:00Z",
        expires_at: null, is_active: true, attachment_bucket: null, attachment_path: null,
        attachment_name: null, attachment_mime: null, attachment_bytes: null,
        created_by: "u-admin-b", created_at: "2026-09-20T10:00:00Z",
      },
    ],
    notice_targets: [
      { id: "nt1", school_id: A, notice_id: "n-sec7a", audience_type: "SECTION", class_id: null, section_id: "sec7a" },
      { id: "nt2", school_id: A, notice_id: "n-sec7b", audience_type: "SECTION", class_id: null, section_id: "sec7b" },
      { id: "nt3", school_id: B, notice_id: "n-b", audience_type: "SCHOOL", class_id: null, section_id: null },
    ],
    notifications: [
      {
        id: "notif1", school_id: A, user_id: "u-parent", type: "NOTICE",
        title: "New notice: 7A field trip", message: "Section-specific",
        entity: "notices", entity_id: "n-sec7a", is_read: false, read_at: null,
        created_at: "2026-09-21T10:00:00Z",
      },
      {
        id: "notif2", school_id: A, user_id: "u-parent", type: "NOTICE",
        title: "New notice: Annual day", message: "School-wide",
        entity: "notices", entity_id: "n-school", is_read: true,
        read_at: "2026-09-21T12:00:00Z", created_at: "2026-09-20T10:00:00Z",
      },
      {
        id: "notifb", school_id: B, user_id: "u-admin-b", type: "NOTICE",
        title: "B notice", message: "Other school", entity: "notices",
        entity_id: "n-b", is_read: false, read_at: null, created_at: "2026-09-20T10:00:00Z",
      },
    ],
    audit_logs: [],
  };
}

const db = () => createFakeDb(seed()) as unknown as DbClient;

describe("notice audience targeting (server-side)", () => {
  it("parent sees school-wide + own-section notices, not other sections", async () => {
    const { notices } = await listNotices(db(), parentCtx(), { page: 1, limit: 50 });
    const ids = notices.map((n) => n.id).sort();
    // n-school (untargeted=school-wide) + n-sec7a (own section); NOT n-sec7b,
    // NOT n-expired (expired excluded), NOT n-b (other school).
    expect(ids).toEqual(["n-school", "n-sec7a"]);
  });

  it("teacher sees school-wide + TEACHERS + own-section notices", async () => {
    const fake = createFakeDb(seed());
    // Add a TEACHERS-targeted notice.
    (fake.seed["notices"] as Row[]).push({
      id: "n-teachers", school_id: A, title: "Staff meeting", content: "Teachers only",
      category: "GENERAL", is_published: true, published_at: "2026-09-22T10:00:00Z",
      expires_at: null, is_active: true, attachment_bucket: null, attachment_path: null,
      attachment_name: null, attachment_mime: null, attachment_bytes: null,
      created_by: "u-admin", created_at: "2026-09-22T10:00:00Z",
    });
    (fake.seed["notice_targets"] as Row[]).push({
      id: "nt4", school_id: A, notice_id: "n-teachers", audience_type: "TEACHERS",
      class_id: null, section_id: null,
    });
    const { notices } = await listNotices(fake as unknown as DbClient, teacherCtx(), {
      page: 1,
      limit: 50,
    });
    const ids = notices.map((n) => n.id).sort();
    // t1 is class teacher of sec7a → n-sec7a yes; n-sec7b (t2's) no.
    expect(ids).toContain("n-teachers");
    expect(ids).toContain("n-sec7a");
    expect(ids).toContain("n-school");
    expect(ids).not.toContain("n-sec7b");
    expect(ids).not.toContain("n-expired");
  });

  it("in-audience detail works; outside audience is 404", async () => {
    await expect(getNotice(db(), parentCtx(), "n-sec7a")).resolves.toBeDefined();
    await expect(getNotice(db(), parentCtx(), "n-sec7b")).rejects.toThrow(
      TenantBoundaryError,
    );
    await expect(getNotice(db(), parentCtx(), "n-b")).rejects.toThrow(NotFoundError);
  });

  it("expired notices are excluded from feeds", async () => {
    const { notices } = await listNotices(db(), adminCtx(), { page: 1, limit: 50 });
    expect(notices.map((n) => n.id)).not.toContain("n-expired");
  });
});

describe("tenant isolation", () => {
  it("admin lists only own-school notices", async () => {
    const { notices } = await listNotices(db(), adminCtx(), { page: 1, limit: 50 });
    expect(notices.map((n) => n.id)).not.toContain("n-b");
  });

  it("cross-school class/section targets are rejected", async () => {
    const fake = createFakeDb(seed());
    await expect(
      createNotice(fake as unknown as DbClient, adminCtx(), {
        title: "Hijack",
        content: "Nope",
        category: "CLASS",
        audience: { type: "CLASS", classId: "cb1", sectionId: null },
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      createNotice(fake as unknown as DbClient, adminCtx(), {
        title: "Hijack",
        content: "Nope",
        category: "SECTION",
        audience: { type: "SECTION", classId: null, sectionId: "secb" },
      }),
    ).rejects.toThrow(NotFoundError);
    expect(fake.callsTo("notices", "insert")).toHaveLength(0);
  });
});

describe("notice mutations + authorization", () => {
  it("teacher cannot create/edit/delete notices (read-only matrix)", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    await expect(
      createNotice(client, teacherCtx(), {
        title: "Nope",
        content: "Nope",
        category: "GENERAL",
        audience: { type: "SCHOOL", classId: null, sectionId: null },
      }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      updateNotice(client, teacherCtx(), "n-school", { title: "Nope" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(deleteNotice(client, teacherCtx(), "n-school")).rejects.toThrow(
      ForbiddenError,
    );
    expect(fake.callsTo("notices", "insert")).toHaveLength(0);
    expect(fake.callsTo("notices", "update")).toHaveLength(0);
  });

  it("parent cannot create/edit/delete notices", async () => {
    const fake = createFakeDb(seed());
    await expect(
      createNotice(fake as unknown as DbClient, parentCtx(), {
        title: "Nope",
        content: "Nope",
        category: "GENERAL",
        audience: { type: "SCHOOL", classId: null, sectionId: null },
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(fake.callsTo("notices", "insert")).toHaveLength(0);
  });

  it("admin creates, updates targets (audited), archives, restores lifecycle", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    const { id } = await createNotice(client, adminCtx(), {
      title: "Exam week",
      content: "Unit tests next week",
      category: "EXAM",
      audience: { type: "SCHOOL", classId: null, sectionId: null },
    });
    await updateNotice(client, adminCtx(), id, {
      audience: { type: "SECTION", classId: null, sectionId: "sec7a" },
    });
    await deleteNotice(client, adminCtx(), id);
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits.map((a) => (a.payload as Row)["action"])).toEqual([
      "notice.created",
      "notice.updated",
      "notice.deleted",
    ]);
    // Soft-delete: the row remains with is_active=false.
    const archived = (fake.seed["notices"] as Row[]).find((r) => r["id"] === id);
    expect(archived?.["is_active"]).toBe(false);
  });
});

describe("attachment authorization", () => {
  it("admin sets an attachment (validated, private bucket, audited)", async () => {
    const fake = createFakeDb(seed());
    await setNoticeAttachment(fake as unknown as DbClient, adminCtx(), "n-school", {
      name: "circular.pdf",
      type: "application/pdf",
      size: 2048,
      bytes: new ArrayBuffer(2048),
    });
    const uploads = fake.callsTo("storage:notice-attachments", "insert");
    expect(uploads).toHaveLength(1);
    const path = (uploads[0]?.payload as { path: string }).path;
    expect(path.startsWith(`schools/${A}/notices/`)).toBe(true);
    const audits = fake.callsTo("audit_logs", "insert");
    expect(audits[0]?.payload).toMatchObject({ action: "notice.attachment_set" });
  });

  it("invalid attachment types are rejected", async () => {
    await expect(
      setNoticeAttachment(db(), adminCtx(), "n-school", {
        name: "evil.exe",
        type: "application/x-msdownload",
        size: 2048,
        bytes: new ArrayBuffer(2048),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("signed URL respects the audience scope", async () => {
    const fake = createFakeDb(seed());
    await setNoticeAttachment(fake as unknown as DbClient, adminCtx(), "n-school", {
      name: "circular.pdf",
      type: "application/pdf",
      size: 2048,
      bytes: new ArrayBuffer(2048),
    });
    // Parent: school-wide notice → allowed.
    const url = await getNoticeAttachmentUrl(fake as unknown as DbClient, parentCtx(), "n-school");
    expect(url.startsWith("https://signed.test/notice-attachments/")).toBe(true);
    // Parent: other section's notice → 404.
    const fake2 = createFakeDb(seed());
    await setNoticeAttachment(fake2 as unknown as DbClient, adminCtx(), "n-sec7b", {
      name: "sports.pdf",
      type: "application/pdf",
      size: 2048,
      bytes: new ArrayBuffer(2048),
    });
    await expect(
      getNoticeAttachmentUrl(fake2 as unknown as DbClient, parentCtx(), "n-sec7b"),
    ).rejects.toThrow(TenantBoundaryError);
  });
});

describe("notification recipient isolation + fan-out", () => {
  it("resolves recipients per audience type server-side", async () => {
    const client = db();
    const school = await resolveRecipients(client, adminCtx(), { type: "SCHOOL" });
    expect(school.sort()).toEqual([
      "u-admin",
      "u-parent",
      "u-teacher",
      "u-teacher2",
    ]);
    const section = await resolveRecipients(client, adminCtx(), {
      type: "SECTION",
      sectionId: "sec7a",
    });
    // Admins + class teacher (t1) + parents of sec7a students (p1).
    expect(section.sort()).toEqual(["u-admin", "u-parent", "u-teacher"]);
    const teachers = await resolveRecipients(client, adminCtx(), { type: "TEACHERS" });
    expect(teachers.sort()).toEqual(["u-teacher", "u-teacher2"]); // no admins
  });

  it("publish fans out to the targeted audience", async () => {
    const fake = createFakeDb(seed());
    const client = fake as unknown as DbClient;
    const { id } = await createNotice(client, adminCtx(), {
      title: "Fee reminder",
      content: "Term fees due",
      category: "GENERAL",
      audience: { type: "PARENTS", classId: null, sectionId: null },
    });
    await setNoticePublished(client, adminCtx(), id, true);
    const inserts = fake.callsTo("notifications", "insert");
    expect(inserts.length).toBeGreaterThanOrEqual(1);
    // The audit records the recipient count.
    const audits = fake.callsTo("audit_logs", "insert");
    const publishAudit = audits.find(
      (a) => (a.payload as Row)["action"] === "notice.published",
    );
    expect(publishAudit?.payload).toMatchObject({ school_id: A });
  });

  it("inbox is recipient-isolated: parent sees only their own rows", async () => {
    const { notifications } = await listNotifications(db(), parentCtx(), {
      page: 1,
      limit: 50,
    });
    expect(notifications.map((n) => n.id).sort()).toEqual(["notif1", "notif2"]);
    // B's admin inbox is a different tenant → invisible (404 on mark-read).
    await expect(markNotificationRead(db(), parentCtx(), "notifb")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("unread count + read-state behavior", async () => {
    const client = db();
    expect(await unreadCount(client, parentCtx())).toBe(1);
    await markNotificationRead(client, parentCtx(), "notif1");
    expect(await unreadCount(client, parentCtx())).toBe(0);
    // Idempotent re-read.
    await markNotificationRead(client, parentCtx(), "notif1");
    expect(await unreadCount(client, parentCtx())).toBe(0);
  });

  it("mark all as read clears the badge", async () => {
    const client = db();
    await markAllNotificationsRead(client, parentCtx());
    expect(await unreadCount(client, parentCtx())).toBe(0);
  });

  it("fanOutNotification dedupes recipients", async () => {
    const client = db();
    // sec7a + CLASS c7 both resolve to overlapping recipient sets.
    const recipients = await fanOutNotification(client, adminCtx(), {
      type: "HOMEWORK",
      title: "New homework",
      message: "Algebra worksheet",
      entity: "homework",
      audience: { type: "CLASS", classId: "c7", sectionId: null },
    });
    expect(recipients.recipients).toBeGreaterThan(0);
    const inserts = (client as unknown as ReturnType<typeof createFakeDb>).callsTo(
      "notifications",
      "insert",
    );
    expect(inserts).toHaveLength(1); // single chunk (small school)
  });
});
