import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getStudentAttendance } from "@/lib/services/attendance";
import { examScopeClassIds } from "@/lib/services/exams";
import { listHomework } from "@/lib/services/homework";
import { getStudentResult } from "@/lib/services/marks";
import { getStudent } from "@/lib/services/students";
import { assertTimetableSectionAccess } from "@/lib/services/timetable";
import { as, errorName, schoolId, serviceClient, signIn } from "./helpers";
import { DEMO_ACCOUNTS } from "../../scripts/local-demo.mjs";

/**
 * A teacher who is also a parent at the same school. Anita teaches Grade 9;
 * for these tests she is made Diya's (Grade 10) parent, then restored.
 */
describe("teacher who is also a parent", () => {
  const db = serviceClient();
  let anitaUserId = "";
  let parentId = "";
  let diya = { id: "", section_id: "", class_id: "" };

  beforeAll(async () => {
    const school = await schoolId("greenfield-demo");
    const { data: user } = await db.from("users").select("id").eq("email", DEMO_ACCOUNTS.teacher.email).single();
    anitaUserId = (user as { id: string }).id;
    const { data: child } = await db
      .from("students")
      .select("id, section_id, class_id")
      .eq("school_id", school)
      .eq("first_name", "Diya")
      .single();
    diya = child as typeof diya;
    const { data: parent } = await db
      .from("parents")
      .insert({ school_id: school, user_id: anitaUserId, full_name: "Anita Verma (parent)" })
      .select("id")
      .single();
    parentId = (parent as { id: string }).id;
    await db.from("student_parents").insert({ student_id: diya.id, parent_id: parentId, relation: "mother", is_primary: false });
    await db.from("user_roles").insert({ user_id: anitaUserId, role: "PARENT" });
  });

  afterAll(async () => {
    await db.from("user_roles").delete().eq("user_id", anitaUserId).eq("role", "PARENT");
    await db.from("student_parents").delete().eq("parent_id", parentId);
    await db.from("parents").delete().eq("id", parentId);
  });

  it("can open their own child's record, attendance and homework outside the classes they teach", async () => {
    const anita = await signIn(DEMO_ACCOUNTS.teacher.email);
    expect(anita.ctx.roles).toEqual(expect.arrayContaining(["TEACHER", "PARENT"]));
    expect((await getStudent(anita.db, anita.ctx, diya.id)).student.id).toBe(diya.id);
    await expect(getStudentAttendance(anita.db, anita.ctx, diya.id, { page: 1, limit: 20 })).resolves.toBeDefined();
    await expect(
      listHomework(anita.db, anita.ctx, { sectionId: diya.section_id, page: 1, limit: 20 }),
    ).resolves.toBeDefined();
    await expect(assertTimetableSectionAccess(anita.db, anita.ctx, diya.section_id)).resolves.toBeUndefined();
    expect(await examScopeClassIds(anita.db, anita.ctx)).toContain(diya.class_id);
  });

  it("sees their child's results as a parent: published subjects only", async () => {
    const anita = await signIn(DEMO_ACCOUNTS.teacher.email);
    const { data: exam } = await db.from("exams").select("id").eq("class_id", diya.class_id).single();
    const result = await getStudentResult(anita.db, anita.ctx, diya.id, (exam as { id: string }).id);
    expect(result.subjects.map((s) => s.subjectName)).toEqual(["English"]);
  });

  it("still cannot open other children outside the classes they teach", async () => {
    const anita = await signIn(DEMO_ACCOUNTS.teacher.email);
    const other = await as("student2"); // Kavya
    const { data: kavya } = await db.from("students").select("id, section_id").eq("user_id", other.ctx.profile.id).single();
    const { data: diyaSectionPeer } = await db
      .from("students")
      .select("id")
      .eq("section_id", diya.section_id)
      .neq("id", diya.id)
      .limit(1)
      .maybeSingle();
    const outsider = (diyaSectionPeer ?? kavya) as { id: string };
    expect(await errorName(() => getStudent(anita.db, anita.ctx, outsider.id))).not.toBe("none");
  });
});
