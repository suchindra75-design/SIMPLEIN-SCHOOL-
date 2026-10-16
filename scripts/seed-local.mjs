#!/usr/bin/env node
/**
 * LOCAL-ONLY demo / integration-test seed for SIMPLIN SCHOOL ERP.
 *
 * Creates two fictional schools with people, academic structure, attendance,
 * exams and marks, timetable, homework, notices, notifications, fees and a past
 * paper, so every portal and the integration tests have realistic data:
 *   - "Greenfield Demo School"  (slug greenfield-demo)  — the demo school
 *   - "Riverside Demo Academy"  (slug riverside-demo)   — second tenant, used to
 *     prove cross-school isolation; it deliberately repeats a few identifiers.
 *
 * SAFETY: refuses to run unless the Supabase URL is http(s)://localhost or
 * 127.0.0.1. It never reads .env files. Never point it at a hosted project.
 *
 * Usage (after `npx supabase start` in this repo):
 *   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
 *   LOCAL_SUPABASE_SERVICE_ROLE_KEY=<"service_role key" from `npx supabase status`> \
 *   node scripts/seed-local.mjs
 *
 * To start over: `npx supabase db reset` (local only — never add --linked), then seed again.
 * All demo accounts use DEMO_PASSWORD from scripts/local-demo.mjs; it only exists
 * in local databases created from this script.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DEMO_PASSWORD } from "./local-demo.mjs";

const url = process.env["LOCAL_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const serviceKey = process.env["LOCAL_SUPABASE_SERVICE_ROLE_KEY"];

const { hostname } = new URL(url);
if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  console.error(`Refusing to seed ${hostname}: this script only targets a local Supabase.`);
  process.exit(1);
}
if (!serviceKey) {
  console.error("Set LOCAL_SUPABASE_SERVICE_ROLE_KEY (the local key from `npx supabase status`).");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

/* ----------------------------------------------------------------- helpers */

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function insert(table, rows, label = table) {
  // defaultToNull: false — columns a row omits take their DB default rather
  // than an explicit NULL (bulk inserts send the union of all rows' keys).
  return must(await db.from(table).insert(rows, { defaultToNull: false }).select(), `insert ${label}`);
}
async function insertOne(table, row, label = table) {
  return (await insert(table, [row], label))[0];
}
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const TODAY = new Date(`${iso(new Date())}T00:00:00Z`);

/** The last `count` weekdays before today (oldest first). */
function recentWeekdays(count) {
  const days = [];
  for (let d = addDays(TODAY, -1); days.length < count; d = addDays(d, -1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.unshift(iso(d));
  }
  return days;
}

/** CBSE-style 9-point bands used by both schools. */
const GRADE_BANDS = [
  ["A1", 91, 100, 10],
  ["A2", 81, 90.99, 9],
  ["B1", 71, 80.99, 8],
  ["B2", 61, 70.99, 7],
  ["C1", 51, 60.99, 6],
  ["C2", 41, 50.99, 5],
  ["D", 33, 40.99, 4],
  ["E", 0, 32.99, 0],
];
function gradeFor(obtained, max) {
  const pct = (obtained / max) * 100;
  return GRADE_BANDS.find(([, min, maxPct]) => pct >= min && pct <= maxPct + 0.009)?.[0] ?? "E";
}

/** Auth identity + profile row + role grants. Returns the public.users row. */
async function createLogin(schoolId, { email, fullName, phone = null, roles }) {
  const created = must(
    await db.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
    `auth user ${email}`,
  );
  const profile = await insertOne(
    "users",
    { auth_user_id: created.user.id, school_id: schoolId, email, full_name: fullName, phone },
    `users ${email}`,
  );
  await insert("user_roles", roles.map((role) => ({ user_id: profile.id, role })), `roles ${email}`);
  return profile;
}

async function createSchool({ name, slug }) {
  const existing = must(await db.from("schools").select("id").eq("slug", slug), "lookup school");
  if (existing.length > 0) {
    throw new Error(
      `School ${slug} already exists. Reset the LOCAL database first: npx supabase db reset`,
    );
  }
  return insertOne("schools", { name, slug, timezone: "Asia/Kolkata" });
}

/* ------------------------------------------------------- Greenfield (demo) */

async function seedGreenfield() {
  const school = await createSchool({ name: "Greenfield Demo School", slug: "greenfield-demo" });
  const S = school.id;

  const [current] = await insert("academic_years", [
    { school_id: S, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
    { school_id: S, name: "2025-26", starts_on: "2025-04-01", ends_on: "2026-03-31", is_current: false },
  ]);
  const AY = current.id;

  const admin = await createLogin(S, {
    email: "admin@greenfield.test",
    fullName: "Neha Kapoor",
    phone: "9876500100",
    roles: ["SCHOOL_ADMIN"],
  });

  // Second admin: fee payments use maker-checker (another admin verifies).
  const accounts = await createLogin(S, {
    email: "accounts@greenfield.test",
    fullName: "Farah Khan",
    roles: ["SCHOOL_ADMIN"],
  });

  // Classes, sections, subjects
  const [g9, g10] = await insert("classes", [
    { school_id: S, name: "Grade 9", order_index: 9 },
    { school_id: S, name: "Grade 10", order_index: 10 },
  ]);
  const subjects = await insert("subjects", [
    { school_id: S, name: "Mathematics", code: "MAT", order_index: 1 },
    { school_id: S, name: "Science", code: "SCI", order_index: 2 },
    { school_id: S, name: "English", code: "ENG", order_index: 3 },
    { school_id: S, name: "Social Science", code: "SST", order_index: 4 },
  ]);
  const sub = Object.fromEntries(subjects.map((s) => [s.code, s]));
  await insert("class_subjects", [
    ...["MAT", "SCI", "ENG"].map((c) => ({ school_id: S, class_id: g9.id, subject_id: sub[c].id })),
    ...["MAT", "ENG", "SST"].map((c) => ({ school_id: S, class_id: g10.id, subject_id: sub[c].id })),
  ]);

  // Teachers (two with logins)
  const anitaUser = await createLogin(S, {
    email: "anita.verma@greenfield.test",
    fullName: "Anita Verma",
    phone: "9876500201",
    roles: ["TEACHER"],
  });
  const rahulUser = await createLogin(S, {
    email: "rahul.sharma@greenfield.test",
    fullName: "Rahul Sharma",
    phone: "9876500202",
    roles: ["TEACHER"],
  });
  const [anita, rahul, meera] = await insert("teachers", [
    { school_id: S, user_id: anitaUser.id, employee_no: "T-1001", first_name: "Anita", last_name: "Verma", display_name: "Anita Verma", phone: "9876500201", email: anitaUser.email, qualification: "M.Sc, B.Ed", date_of_joining: "2019-06-01" },
    { school_id: S, user_id: rahulUser.id, employee_no: "T-1002", first_name: "Rahul", last_name: "Sharma", display_name: "Rahul Sharma", phone: "9876500202", email: rahulUser.email, qualification: "M.Sc, B.Ed", date_of_joining: "2021-06-01" },
    { school_id: S, employee_no: "T-1003", first_name: "Meera", last_name: "Iyer", display_name: "Meera Iyer", qualification: "M.A, B.Ed", date_of_joining: "2018-06-01" },
  ]);

  const [s9a, s9b] = await insert("sections", [
    { school_id: S, class_id: g9.id, name: "A", order_index: 1, class_teacher_id: anita.id, room: "101" },
    { school_id: S, class_id: g9.id, name: "B", order_index: 2, class_teacher_id: rahul.id, room: "102" },
  ]);
  const [s10a] = await insert("sections", [
    { school_id: S, class_id: g10.id, name: "A", order_index: 1, class_teacher_id: meera.id, room: "201" },
  ]);

  await insert("teacher_subjects", [
    { school_id: S, teacher_id: anita.id, subject_id: sub.MAT.id, section_id: s9a.id, academic_year_id: AY },
    { school_id: S, teacher_id: anita.id, subject_id: sub.MAT.id, section_id: s9b.id, academic_year_id: AY },
    { school_id: S, teacher_id: rahul.id, subject_id: sub.SCI.id, section_id: s9a.id, academic_year_id: AY },
    { school_id: S, teacher_id: rahul.id, subject_id: sub.ENG.id, section_id: s10a.id, academic_year_id: AY },
    { school_id: S, teacher_id: meera.id, subject_id: sub.MAT.id, section_id: s10a.id, academic_year_id: AY },
    { school_id: S, teacher_id: meera.id, subject_id: sub.ENG.id, section_id: s9a.id, academic_year_id: AY },
  ]);

  // Students
  const studentSpecs = [
    ["GPS-2026-001", "Aarav", "Sharma", "male", s9a, g9, "1", "9876500301"],
    ["GPS-2026-002", "Ananya", "Verma", "female", s9a, g9, "2", "9876500303"],
    ["GPS-2026-003", "Rohan", "Kumar", "male", s9a, g9, "3", "9876500304"],
    ["GPS-2026-004", "Pooja", "Singh", "female", s9a, g9, "4", "9876500305"],
    ["GPS-2026-005", "Arjun", "Reddy", "male", s9b, g9, "1", "9876500306"],
    ["GPS-2026-006", "Sneha", "Nair", "female", s9b, g9, "2", "9876500302"],
    ["GPS-2026-007", "Kavya", "Menon", "female", s10a, g10, "1", "9876500307"],
    ["GPS-2026-008", "Diya", "Sharma", "female", s10a, g10, "2", "9876500301"],
  ];
  const students = await insert(
    "students",
    studentSpecs.map(([adm, first, last, gender, sec, cls, roll, guardianPhone], i) => ({
      school_id: S,
      admission_no: adm,
      first_name: first,
      last_name: last,
      display_name: `${first} ${last}`,
      gender,
      dob: `201${i % 2 === 0 ? 1 : 2}-0${(i % 9) + 1}-1${i % 9}`,
      address: "12 Lake View Road, Hyderabad 500001",
      guardian_phone: guardianPhone,
      admission_date: "2026-04-01",
      class_id: cls.id,
      section_id: sec.id,
      roll_number: roll,
    })),
  );
  const st = Object.fromEntries(students.map((s) => [s.admission_no, s]));
  await insert(
    "student_enrollments",
    students.map((s) => ({
      school_id: S,
      student_id: s.id,
      academic_year_id: AY,
      class_id: s.class_id,
      section_id: s.section_id,
      roll_number: s.roll_number,
    })),
  );

  // Student logins (two)
  for (const [adm, email] of [
    ["GPS-2026-001", "aarav.sharma@greenfield.test"],
    ["GPS-2026-007", "kavya.menon@greenfield.test"],
  ]) {
    const u = await createLogin(S, { email, fullName: st[adm].display_name, roles: ["STUDENT"] });
    must(await db.from("students").update({ user_id: u.id }).eq("id", st[adm].id), `link ${adm}`);
  }

  // Parents (two with logins; Ramesh has two children)
  const rameshUser = await createLogin(S, {
    email: "ramesh.sharma@greenfield.test",
    fullName: "Ramesh Sharma",
    phone: "9876500301",
    roles: ["PARENT"],
  });
  const lakshmiUser = await createLogin(S, {
    email: "lakshmi.nair@greenfield.test",
    fullName: "Lakshmi Nair",
    phone: "9876500302",
    roles: ["PARENT"],
  });
  const [ramesh, lakshmi, suresh] = await insert("parents", [
    { school_id: S, user_id: rameshUser.id, full_name: "Ramesh Sharma", phone: "9876500301", email: rameshUser.email },
    { school_id: S, user_id: lakshmiUser.id, full_name: "Lakshmi Nair", phone: "9876500302", email: lakshmiUser.email },
    { school_id: S, full_name: "Suresh Verma", phone: "9876500303" },
  ]);
  await insert("student_parents", [
    { student_id: st["GPS-2026-001"].id, parent_id: ramesh.id, relation: "father", is_primary: true },
    { student_id: st["GPS-2026-008"].id, parent_id: ramesh.id, relation: "father", is_primary: true },
    { student_id: st["GPS-2026-006"].id, parent_id: lakshmi.id, relation: "mother", is_primary: true },
    { student_id: st["GPS-2026-002"].id, parent_id: suresh.id, relation: "father", is_primary: true },
  ]);

  // Attendance: last five weekdays for 9-A, three for 9-B
  const absences = { "GPS-2026-003": 1, "GPS-2026-004": 3, "GPS-2026-006": 0 };
  const leaves = { "GPS-2026-002": 2 };
  for (const [section, days, author] of [
    [s9a, recentWeekdays(5), anitaUser],
    [s9b, recentWeekdays(3), rahulUser],
  ]) {
    const roster = students.filter((s) => s.section_id === section.id);
    for (const [dayIndex, date] of days.entries()) {
      const session = await insertOne("attendance_sessions", {
        school_id: S,
        academic_year_id: AY,
        section_id: section.id,
        attendance_date: date,
        status: "SUBMITTED",
        created_by: author.id,
        updated_by: author.id,
      });
      await insert(
        "attendance_records",
        roster.map((s) => ({
          school_id: S,
          attendance_session_id: session.id,
          student_id: s.id,
          status:
            absences[s.admission_no] === dayIndex
              ? "ABSENT"
              : leaves[s.admission_no] === dayIndex
                ? "LEAVE"
                : "PRESENT",
          remark: leaves[s.admission_no] === dayIndex ? "Medical leave" : null,
          updated_by: author.id,
        })),
      );
    }
  }

  // Grading system
  const grading = await insertOne("grading_systems", { school_id: S, name: "CBSE 9-point", is_default: true });
  await insert(
    "grading_rules",
    GRADE_BANDS.map(([grade, min, max, gp]) => ({
      school_id: S,
      grading_system_id: grading.id,
      grade,
      min_percentage: min,
      max_percentage: max,
      grade_point: gp,
    })),
  );

  // Exams: Grade 9 Unit Test 1 (Maths published, Science/English unpublished), Grade 10 Unit Test 1
  const ut9 = await insertOne("exams", {
    school_id: S,
    academic_year_id: AY,
    class_id: g9.id,
    name: "Unit Test 1",
    starts_on: "2026-07-14",
    ends_on: "2026-07-18",
  });
  const [ut9Mat, ut9Sci, ut9Eng] = await insert("exam_subjects", [
    { school_id: S, exam_id: ut9.id, subject_id: sub.MAT.id, max_marks: 50, passing_marks: 17, exam_date: "2026-07-14", start_time: "09:00", end_time: "10:30", is_locked: true, is_published: true },
    { school_id: S, exam_id: ut9.id, subject_id: sub.SCI.id, max_marks: 50, passing_marks: 17, exam_date: "2026-07-16", start_time: "09:00", end_time: "10:30" },
    { school_id: S, exam_id: ut9.id, subject_id: sub.ENG.id, max_marks: 50, passing_marks: 17, exam_date: "2026-07-18", start_time: "09:00", end_time: "10:30" },
  ]);
  await insert("exam_schedules", [
    { school_id: S, exam_subject_id: ut9Mat.id, room: "Hall 1", invigilator_id: meera.id },
    { school_id: S, exam_subject_id: ut9Sci.id, room: "Hall 1", invigilator_id: anita.id },
  ]);
  const ut9Marks = {
    "GPS-2026-001": [46, 41],
    "GPS-2026-002": [38, 44],
    "GPS-2026-003": [29, 33],
    "GPS-2026-004": [null, 25],
    "GPS-2026-005": [42, 39],
    "GPS-2026-006": [49, 47],
  };
  const markRows = [];
  for (const [adm, [mat, sci]] of Object.entries(ut9Marks)) {
    for (const [es, value, author] of [
      [ut9Mat, mat, anitaUser],
      [ut9Sci, sci, rahulUser],
    ]) {
      markRows.push({
        school_id: S,
        exam_subject_id: es.id,
        student_id: st[adm].id,
        marks_obtained: value,
        is_absent: value === null,
        grade: value === null ? null : gradeFor(value, 50),
        entered_by: author.id,
        updated_by: author.id,
      });
    }
  }
  await insert("marks", markRows);

  const ut10 = await insertOne("exams", {
    school_id: S,
    academic_year_id: AY,
    class_id: g10.id,
    name: "Unit Test 1",
    starts_on: "2026-07-15",
    ends_on: "2026-07-17",
  });
  const [ut10Eng] = await insert("exam_subjects", [
    { school_id: S, exam_id: ut10.id, subject_id: sub.ENG.id, max_marks: 40, passing_marks: 14, exam_date: "2026-07-15", start_time: "10:00", end_time: "11:00", is_locked: true, is_published: true },
    { school_id: S, exam_id: ut10.id, subject_id: sub.MAT.id, max_marks: 40, passing_marks: 14, exam_date: "2026-07-17", start_time: "10:00", end_time: "11:00" },
  ]);
  await insert("marks", [
    { school_id: S, exam_subject_id: ut10Eng.id, student_id: st["GPS-2026-007"].id, marks_obtained: 35, grade: gradeFor(35, 40), entered_by: rahulUser.id, updated_by: rahulUser.id },
    { school_id: S, exam_subject_id: ut10Eng.id, student_id: st["GPS-2026-008"].id, marks_obtained: 31, grade: gradeFor(31, 40), entered_by: rahulUser.id, updated_by: rahulUser.id },
  ]);

  // Timetable: 9-A Monday–Friday, five periods
  const periods = [
    ["08:00", "08:40"],
    ["08:40", "09:20"],
    ["09:35", "10:15"],
    ["10:15", "10:55"],
    ["11:10", "11:50"],
  ];
  const plan9a = [
    ["MAT", "SCI", "ENG", "MAT", "SCI"],
    ["ENG", "MAT", "SCI", "ENG", "MAT"],
    ["SCI", "ENG", "MAT", "SCI", "ENG"],
    ["MAT", "ENG", "SCI", "MAT", "ENG"],
    ["SCI", "MAT", "ENG", "SCI", "MAT"],
  ];
  const teacherFor9a = { MAT: anita.id, SCI: rahul.id, ENG: meera.id };
  const slots = [];
  plan9a.forEach((row, d) =>
    row.forEach((code, p) =>
      slots.push({
        school_id: S,
        academic_year_id: AY,
        section_id: s9a.id,
        subject_id: sub[code].id,
        teacher_id: teacherFor9a[code],
        day_of_week: d + 1,
        period_index: p + 1,
        starts_at: periods[p][0],
        ends_at: periods[p][1],
        room: "101",
      }),
    ),
  );
  // 10-A uses periods 6–7 so its teachers never clash with their 9-A periods
  // (timetable_slots_teacher_no_clash_idx).
  for (let d = 1; d <= 5; d++) {
    slots.push({ school_id: S, academic_year_id: AY, section_id: s10a.id, subject_id: sub.ENG.id, teacher_id: rahul.id, day_of_week: d, period_index: 6, starts_at: "12:00", ends_at: "12:40", room: "201" });
    slots.push({ school_id: S, academic_year_id: AY, section_id: s10a.id, subject_id: sub.MAT.id, teacher_id: meera.id, day_of_week: d, period_index: 7, starts_at: "12:40", ends_at: "13:20", room: "201" });
  }
  await insert("timetable_slots", slots);

  // Homework
  await insert("homework", [
    { school_id: S, academic_year_id: AY, section_id: s9a.id, subject_id: sub.MAT.id, teacher_id: anita.id, title: "Linear equations — exercise 4.2", description: "Solve questions 1–12 from exercise 4.2. Show every step.", assigned_on: iso(addDays(TODAY, -1)), due_date: iso(addDays(TODAY, 3)) },
    { school_id: S, academic_year_id: AY, section_id: s9a.id, subject_id: sub.SCI.id, teacher_id: rahul.id, title: "Cell structure diagram", description: "Draw and label a plant cell and an animal cell.", assigned_on: iso(TODAY), due_date: iso(addDays(TODAY, 5)) },
    { school_id: S, academic_year_id: AY, section_id: s9b.id, subject_id: sub.MAT.id, teacher_id: anita.id, title: "Polynomials worksheet", description: "Complete the polynomials worksheet shared in class.", assigned_on: iso(addDays(TODAY, -2)), due_date: iso(addDays(TODAY, 2)) },
    { school_id: S, academic_year_id: AY, section_id: s10a.id, subject_id: sub.ENG.id, teacher_id: rahul.id, title: "Essay: My favourite book", description: "Write a 300-word essay about your favourite book.", assigned_on: iso(addDays(TODAY, -3)), due_date: iso(addDays(TODAY, 4)) },
  ]);

  // Notices + targets
  const publishedAt = new Date().toISOString();
  const [ptm, lab, staff, draft] = await insert("notices", [
    { school_id: S, title: "Parent–Teacher Meeting on Saturday", content: "The term 1 parent–teacher meeting is on Saturday from 9:00 to 12:00. Please meet your child's class teacher.", category: "GENERAL", is_published: true, published_at: publishedAt, created_by: admin.id },
    { school_id: S, title: "Grade 9-A science lab visit", content: "Grade 9-A will visit the science lab on Thursday. Students must bring their lab coats.", category: "SECTION", is_published: true, published_at: publishedAt, created_by: admin.id },
    { school_id: S, title: "Staff meeting: exam duty roster", content: "All teachers: the exam duty roster meeting is in the staff room on Friday at 15:30.", category: "GENERAL", is_published: true, published_at: publishedAt, created_by: admin.id },
    { school_id: S, title: "Annual day (draft)", content: "Draft announcement for the annual day celebrations.", category: "GENERAL", is_published: false, created_by: admin.id },
  ]);
  await insert("notice_targets", [
    { school_id: S, notice_id: ptm.id, audience_type: "SCHOOL" },
    { school_id: S, notice_id: lab.id, audience_type: "SECTION", section_id: s9a.id },
    { school_id: S, notice_id: staff.id, audience_type: "TEACHERS" },
    { school_id: S, notice_id: draft.id, audience_type: "SCHOOL" },
  ]);

  // Notifications
  await insert("notifications", [
    { school_id: S, user_id: rameshUser.id, type: "NOTICE", title: "Parent–Teacher Meeting on Saturday", message: "A new notice has been published.", entity: "notices", entity_id: ptm.id },
    { school_id: S, user_id: rameshUser.id, type: "RESULT", title: "Unit Test 1 Mathematics results published", message: "Aarav's Mathematics marks are now available." },
    { school_id: S, user_id: lakshmiUser.id, type: "ATTENDANCE", title: "Sneha was marked absent", message: "Sneha Nair was marked absent in Grade 9-B." },
    { school_id: S, user_id: anitaUser.id, type: "NOTICE", title: "Staff meeting: exam duty roster", message: "A new staff notice has been published.", entity: "notices", entity_id: staff.id },
    { school_id: S, user_id: admin.id, type: "ACCOUNT", title: "Welcome to SIMPLIN SCHOOL", message: "Your school workspace is ready." },
  ]);

  // Fees
  const [fee9, fee10] = await insert("fee_structures", [
    { school_id: S, academic_year_id: AY, class_id: g9.id, name: "Grade 9 annual fee 2026-27", due_date: "2026-06-30" },
    { school_id: S, academic_year_id: AY, class_id: g10.id, name: "Grade 10 annual fee 2026-27", due_date: "2026-06-30" },
  ]);
  await insert("fee_components", [
    { school_id: S, fee_structure_id: fee9.id, name: "Tuition", amount: 20000 },
    { school_id: S, fee_structure_id: fee9.id, name: "Laboratory", amount: 3000 },
    { school_id: S, fee_structure_id: fee9.id, name: "Sports", amount: 2000 },
    { school_id: S, fee_structure_id: fee10.id, name: "Tuition", amount: 25000 },
    { school_id: S, fee_structure_id: fee10.id, name: "Board registration", amount: 5000 },
  ]);
  const studentFees = await insert(
    "student_fees",
    students.map((s) => ({
      school_id: S,
      student_id: s.id,
      fee_structure_id: s.class_id === g9.id ? fee9.id : fee10.id,
      total_amount: s.class_id === g9.id ? 25000 : 30000,
      due_date: "2026-06-30",
    })),
  );
  const feeOf = (adm) => studentFees.find((f) => f.student_id === st[adm].id);
  await insert("fee_payment_records", [
    { school_id: S, student_fee_id: feeOf("GPS-2026-001").id, amount: 25000, paid_on: "2026-06-12", mode: "BANK_TRANSFER", reference_no: "NEFT-DEMO-0001", recorded_by: admin.id, verified_by: accounts.id },
    { school_id: S, student_fee_id: feeOf("GPS-2026-002").id, amount: 10000, paid_on: "2026-06-20", mode: "CASH", reference_no: "RCPT-DEMO-0002", recorded_by: admin.id },
    { school_id: S, student_fee_id: feeOf("GPS-2026-007").id, amount: 15000, paid_on: "2026-06-15", mode: "CHEQUE", reference_no: "CHQ-DEMO-0003", recorded_by: admin.id, verified_by: accounts.id },
    { school_id: S, student_fee_id: feeOf("GPS-2026-008").id, amount: 30000, paid_on: "2026-06-18", mode: "BANK_TRANSFER", reference_no: "NEFT-DEMO-0004", recorded_by: admin.id, verified_by: accounts.id },
  ]);

  // Past paper (a tiny synthetic PDF in the tenant-prefixed pyqs path)
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
  const pyqPath = `schools/${S}/pyqs/${randomUUID()}.pdf`;
  must(await db.storage.from("pyqs").upload(pyqPath, pdf, { contentType: "application/pdf" }), "upload pyq");
  await insertOne("pyqs", {
    school_id: S,
    class_id: g9.id,
    subject_id: sub.MAT.id,
    year_label: "2025",
    exam_board_name: "School annual exam 2025",
    title: "Grade 9 Mathematics — annual exam 2025 (sample)",
    file_bucket: "pyqs",
    file_path: pyqPath,
    file_name: "grade9-maths-2025.pdf",
    file_mime: "application/pdf",
    file_bytes: pdf.length,
    uploaded_by: admin.id,
  });

  // Cross-school identity collision fixtures (both linked to logins)
  const dupStudent = await insertOne("students", {
    school_id: S, admission_no: "DUP-100", first_name: "Duplicate", last_name: "Greenfield",
    display_name: "Duplicate Greenfield", class_id: g9.id, section_id: s9b.id, roll_number: "9",
  });
  const dupStudentUser = await createLogin(S, { email: "dup.student@greenfield.test", fullName: "Duplicate Greenfield", roles: ["STUDENT"] });
  must(await db.from("students").update({ user_id: dupStudentUser.id }).eq("id", dupStudent.id), "link DUP-100");
  const dupParentUser = await createLogin(S, { email: "dup.parent@greenfield.test", fullName: "Shared Phone Greenfield", phone: "9876500999", roles: ["PARENT"] });
  await insertOne("parents", { school_id: S, user_id: dupParentUser.id, full_name: "Shared Phone Greenfield", phone: "9876500999" });

  return { school, students: students.length };
}

/* ------------------------------------------------- Riverside (2nd tenant) */

async function seedRiverside() {
  const school = await createSchool({ name: "Riverside Demo Academy", slug: "riverside-demo" });
  const S = school.id;
  const ay = await insertOne("academic_years", { school_id: S, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true });
  await createLogin(S, { email: "admin@riverside.test", fullName: "Vikram Rao", roles: ["SCHOOL_ADMIN"] });
  const cls = await insertOne("classes", { school_id: S, name: "Grade 9", order_index: 9 });
  const math = await insertOne("subjects", { school_id: S, name: "Mathematics", code: "MAT" });
  const priyaUser = await createLogin(S, { email: "priya.das@riverside.test", fullName: "Priya Das", roles: ["TEACHER"] });
  const priya = await insertOne("teachers", { school_id: S, user_id: priyaUser.id, employee_no: "T-2001", first_name: "Priya", last_name: "Das", display_name: "Priya Das" });
  const sec = await insertOne("sections", { school_id: S, class_id: cls.id, name: "A", class_teacher_id: priya.id });
  await insertOne("teacher_subjects", { school_id: S, teacher_id: priya.id, subject_id: math.id, section_id: sec.id, academic_year_id: ay.id });

  const [riya, dup] = await insert("students", [
    { school_id: S, admission_no: "RDA-2026-001", first_name: "Riya", last_name: "Bose", display_name: "Riya Bose", class_id: cls.id, section_id: sec.id, roll_number: "1", guardian_phone: "9876500401" },
    { school_id: S, admission_no: "DUP-100", first_name: "Duplicate", last_name: "Riverside", display_name: "Duplicate Riverside", class_id: cls.id, section_id: sec.id, roll_number: "2" },
  ]);
  await insert("student_enrollments", [riya, dup].map((s) => ({ school_id: S, student_id: s.id, academic_year_id: ay.id, class_id: cls.id, section_id: sec.id, roll_number: s.roll_number })));
  const riyaUser = await createLogin(S, { email: "riya.bose@riverside.test", fullName: "Riya Bose", roles: ["STUDENT"] });
  must(await db.from("students").update({ user_id: riyaUser.id }).eq("id", riya.id), "link riya");
  const dupUser = await createLogin(S, { email: "dup.student@riverside.test", fullName: "Duplicate Riverside", roles: ["STUDENT"] });
  must(await db.from("students").update({ user_id: dupUser.id }).eq("id", dup.id), "link dup");

  const boseUser = await createLogin(S, { email: "anil.bose@riverside.test", fullName: "Anil Bose", phone: "9876500401", roles: ["PARENT"] });
  const bose = await insertOne("parents", { school_id: S, user_id: boseUser.id, full_name: "Anil Bose", phone: "9876500401" });
  await insertOne("student_parents", { student_id: riya.id, parent_id: bose.id, relation: "father", is_primary: true });
  const dupParentUser = await createLogin(S, { email: "dup.parent@riverside.test", fullName: "Shared Phone Riverside", phone: "9876500999", roles: ["PARENT"] });
  await insertOne("parents", { school_id: S, user_id: dupParentUser.id, full_name: "Shared Phone Riverside", phone: "9876500999" });

  const session = await insertOne("attendance_sessions", { school_id: S, academic_year_id: ay.id, section_id: sec.id, attendance_date: recentWeekdays(1)[0], created_by: priyaUser.id });
  await insert("attendance_records", [riya, dup].map((s) => ({ school_id: S, attendance_session_id: session.id, student_id: s.id, status: "PRESENT" })));
  const notice = await insertOne("notices", { school_id: S, title: "Riverside sports day", content: "Riverside sports day is next Friday.", is_published: true, published_at: new Date().toISOString() });
  await insertOne("notice_targets", { school_id: S, notice_id: notice.id, audience_type: "SCHOOL" });
  const fee = await insertOne("fee_structures", { school_id: S, academic_year_id: ay.id, class_id: cls.id, name: "Riverside annual fee 2026-27" });
  await insertOne("fee_components", { school_id: S, fee_structure_id: fee.id, name: "Tuition", amount: 40000 });
  await insert("student_fees", [riya, dup].map((s) => ({ school_id: S, student_id: s.id, fee_structure_id: fee.id, total_amount: 40000 })));
  return { school, students: 2 };
}

/* -------------------------------------------------------------------- run */

const greenfield = await seedGreenfield();
const riverside = await seedRiverside();
console.log("Seeded local demo data:");
console.log(`  ${greenfield.school.name} (${greenfield.school.slug}) — ${greenfield.students} students + collision fixtures`);
console.log(`  ${riverside.school.name} (${riverside.school.slug}) — ${riverside.students} students`);
console.log("Demo accounts: see docs/LOCAL_DEMO.md (password: DEMO_PASSWORD in scripts/local-demo.mjs).");
