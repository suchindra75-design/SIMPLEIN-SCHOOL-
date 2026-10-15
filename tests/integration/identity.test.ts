import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveIdentifierToEmail } from "@/lib/services/identity";
import { DEMO_ACCOUNTS, DUPLICATE_IDENTIFIERS, schoolId, serviceClient } from "./helpers";

/**
 * Identifier → email resolution against real PostgREST/Postgres (the unit
 * tests use an in-memory stand-in). Verifies LIKE escaping, PostgREST's `*`
 * alias, `.eq()` literal handling and the `!inner` PARENT-role embed filter.
 */

const tempLogins: { authId: string; userId: string; studentId: string }[] = [];

async function createLinkedStudent(admissionNo: string, email: string) {
  const db = serviceClient();
  const school = await schoolId("greenfield-demo");
  const { data: auth, error: authError } = await db.auth.admin.createUser({
    email,
    password: "integration-only-unused-1",
    email_confirm: true,
  });
  if (authError !== null) throw authError;
  const { data: user } = await db
    .from("users")
    .insert({ auth_user_id: auth.user.id, school_id: school, email, full_name: admissionNo })
    .select("id")
    .single();
  await db.from("user_roles").insert({ user_id: user!.id, role: "STUDENT" });
  const { data: student, error } = await db
    .from("students")
    .insert({
      school_id: school,
      admission_no: admissionNo,
      first_name: "Int",
      display_name: `Int ${admissionNo}`,
      user_id: user!.id,
    })
    .select("id")
    .single();
  if (error !== null) throw error;
  tempLogins.push({ authId: auth.user.id, userId: user!.id, studentId: student!.id });
}

beforeAll(async () => {
  await createLinkedStudent("INT_A1", "int.underscore@greenfield.test");
  await createLinkedStudent("INTXA1", "int.x@greenfield.test");
  await createLinkedStudent("INT*B1", "int.star@greenfield.test");
  await createLinkedStudent("INTYB1", "int.y@greenfield.test");
  await createLinkedStudent("INT\\C1", "int.backslash@greenfield.test");
  await createLinkedStudent("INT%D1", "int.percent@greenfield.test");
});

afterAll(async () => {
  const db = serviceClient();
  for (const t of tempLogins) {
    await db.from("students").delete().eq("id", t.studentId);
    await db.from("users").delete().eq("id", t.userId);
    await db.auth.admin.deleteUser(t.authId);
  }
});

describe("student and teacher identifiers (real PostgREST)", () => {
  it("resolves an admission number, ignoring case and padding", async () => {
    expect(await resolveIdentifierToEmail("STUDENT", "GPS-2026-001")).toEqual({ email: DEMO_ACCOUNTS.student.email });
    expect(await resolveIdentifierToEmail("STUDENT", "  gps-2026-001 ")).toEqual({ email: DEMO_ACCOUNTS.student.email });
  });

  it("resolves an employee number in either school", async () => {
    expect(await resolveIdentifierToEmail("TEACHER", "t-1001")).toEqual({ email: DEMO_ACCOUNTS.teacher.email });
    expect(await resolveIdentifierToEmail("TEACHER", "T-2001")).toEqual({ email: DEMO_ACCOUNTS.otherSchoolTeacher.email });
  });

  it.each(["GPS-2026-00%", "GPS-2026-00_", "GPS-2026-00*", "%", "*", "_PS-2026-001", "T-100%"])(
    "wildcard input %s matches nothing",
    async (identifier) => {
      expect(await resolveIdentifierToEmail("STUDENT", identifier)).toBeNull();
      expect(await resolveIdentifierToEmail("TEACHER", identifier)).toBeNull();
    },
  );

  it("matches _ % * and \\ literally in real identifiers", async () => {
    expect(await resolveIdentifierToEmail("STUDENT", "int_a1")).toEqual({ email: "int.underscore@greenfield.test" });
    expect(await resolveIdentifierToEmail("STUDENT", "INTXA1")).toEqual({ email: "int.x@greenfield.test" });
    expect(await resolveIdentifierToEmail("STUDENT", "INT*B1")).toEqual({ email: "int.star@greenfield.test" });
    expect(await resolveIdentifierToEmail("STUDENT", "INTYB1")).toEqual({ email: "int.y@greenfield.test" });
    expect(await resolveIdentifierToEmail("STUDENT", "int\\c1")).toEqual({ email: "int.backslash@greenfield.test" });
    expect(await resolveIdentifierToEmail("STUDENT", "INT%D1")).toEqual({ email: "int.percent@greenfield.test" });
  });

  it("fails closed for an admission number used by linked students in two schools", async () => {
    expect(await resolveIdentifierToEmail("STUDENT", DUPLICATE_IDENTIFIERS.admissionNo)).toBeNull();
  });
});

describe("parent phone identifiers (real PostgREST)", () => {
  it("resolves the phone as typed and its digits form", async () => {
    expect(await resolveIdentifierToEmail("PARENT", "9876500301")).toEqual({ email: DEMO_ACCOUNTS.parent.email });
    expect(await resolveIdentifierToEmail("PARENT", "98765-00301")).toEqual({ email: DEMO_ACCOUNTS.parent.email });
  });

  it("never resolves a staff member's profile phone as a parent login", async () => {
    // Rahul (TEACHER) and the Greenfield admin have phones on users but no PARENT role.
    expect(await resolveIdentifierToEmail("PARENT", "9876500202")).toBeNull();
    expect(await resolveIdentifierToEmail("PARENT", "9876500100")).toBeNull();
  });

  it("treats PostgREST filter syntax in the phone as literal text", async () => {
    const db = serviceClient();
    const { data: ramesh } = await db.from("parents").select("id").eq("phone", "9876500301").single();
    expect(await resolveIdentifierToEmail("PARENT", `0000000000,id.eq.${ramesh!.id}`)).toBeNull();
    expect(await resolveIdentifierToEmail("PARENT", "x,phone.neq.x")).toBeNull();
  });

  it("fails closed for a phone shared by parents in two schools", async () => {
    expect(await resolveIdentifierToEmail("PARENT", DUPLICATE_IDENTIFIERS.parentPhone)).toBeNull();
  });
});
