#!/usr/bin/env node
/**
 * LOCAL-ONLY load-test seed: one school the size of a real one, for timing
 * pages against realistic row counts (RLS cost grows with rows touched).
 *
 *   "Lakeview Scale School" (slug lakeview-scale)
 *   12 classes × 4 sections = 48 sections, 30 students each = 1,440 students
 *   ~1,300 parents (some with two children), 60 teachers, 6 subjects
 *   60 school days of attendance (2,880 sessions, ~86,000 records)
 *   3 exams per class × 5 subjects (180 exam subjects; marks for the 2 held exams, ~14,400; both published)
 *   Timetable: 5 days × 8 periods for every section (1,920 slots)
 *   Fees: a structure per class, 1,440 assignments, ~960 verified payments
 *   Homework: 10 per section (480). Notices: 40.
 *
 * Logins (password: DEMO_PASSWORD from scripts/local-demo.mjs):
 *   admin@lakeview.test, accounts@lakeview.test (second admin)
 *   teacher.one@lakeview.test (staff code LV-T001, class teacher of Grade 1-A)
 *   parent.one@lakeview.test  (phone 9800000001, two children)
 *   student.one@lakeview.test (admission LV-0001)
 *
 * SAFETY: refuses to run unless the Supabase URL is localhost / 127.0.0.1.
 * Usage (after seed-local.mjs, or on its own):
 *   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
 *   LOCAL_SUPABASE_SERVICE_ROLE_KEY=<local service key> node scripts/seed-scale.mjs
 */
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

const CLASSES = 12;
const SECTIONS_PER_CLASS = 4;
const STUDENTS_PER_SECTION = 30;
const TEACHERS = 60;
const SCHOOL_DAYS = 60;
const PERIODS = 8;

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function insert(table, rows, { select = true, batch = 1000 } = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const q = db.from(table).insert(chunk, { defaultToNull: false });
    const data = must(select ? await q.select() : await q, `insert ${table}`);
    if (select) out.push(...data);
  }
  return out;
}
const insertOne = async (table, row) => (await insert(table, [row]))[0];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const TODAY = new Date(`${iso(new Date())}T00:00:00Z`);
function recentWeekdays(count) {
  const days = [];
  for (let d = addDays(TODAY, -1); days.length < count; d = addDays(d, -1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.unshift(iso(d));
  }
  return days;
}
const GRADE_BANDS = [
  ["A1", 91, 100, 10], ["A2", 81, 90.99, 9], ["B1", 71, 80.99, 8], ["B2", 61, 70.99, 7],
  ["C1", 51, 60.99, 6], ["C2", 41, 50.99, 5], ["D", 33, 40.99, 4], ["E", 0, 32.99, 0],
];
const gradeFor = (o, m) => {
  const pct = (o / m) * 100;
  return GRADE_BANDS.find(([, min, max]) => pct >= min && pct <= max + 0.009)?.[0] ?? "E";
};
// Deterministic pseudo-random numbers (same data every run).
let seed = 20261112;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const FIRST = ["Aarav", "Vivaan", "Aditya", "Ishaan", "Reyansh", "Ananya", "Diya", "Saanvi", "Aadhya", "Myra", "Kabir", "Arjun", "Riya", "Kiara", "Meera", "Rohan", "Nikhil", "Pooja", "Sneha", "Tanvi"];
const LAST = ["Sharma", "Verma", "Iyer", "Nair", "Reddy", "Menon", "Gupta", "Patel", "Singh", "Rao", "Das", "Kulkarni", "Joshi", "Bose", "Khan"];
const pick = (arr, i) => arr[i % arr.length];

async function createLogin(S, { email, fullName, phone = null, roles }) {
  const created = must(
    await db.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } }),
    `auth user ${email}`,
  );
  const profile = await insertOne("users", { auth_user_id: created.user.id, school_id: S, email, full_name: fullName, phone });
  await insert("user_roles", roles.map((role) => ({ user_id: profile.id, role })), { select: false });
  return profile;
}

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

const existing = must(await db.from("schools").select("id").eq("slug", "lakeview-scale"), "lookup school");
if (existing.length > 0) {
  console.error("lakeview-scale already exists. Reset the LOCAL database first (npx supabase db reset), then seed again.");
  process.exit(1);
}
const school = await insertOne("schools", { name: "Lakeview Scale School", slug: "lakeview-scale", timezone: "Asia/Kolkata" });
const S = school.id;
const [year] = await insert("academic_years", [
  { school_id: S, name: "2026-27", starts_on: "2026-04-01", ends_on: "2027-03-31", is_current: true },
]);
const AY = year.id;
const admin = await createLogin(S, { email: "admin@lakeview.test", fullName: "Lakeview Admin", roles: ["SCHOOL_ADMIN"] });
const accounts = await createLogin(S, { email: "accounts@lakeview.test", fullName: "Lakeview Accounts", roles: ["SCHOOL_ADMIN"] });
log("school + admins");

// Subjects, classes, sections, teachers
const subjects = await insert("subjects", ["Mathematics", "Science", "English", "Hindi", "Social Science", "Computer Science"].map((name, i) => ({
  school_id: S, name, code: name.slice(0, 3).toUpperCase() + i, order_index: i + 1,
})));
const classes = await insert("classes", Array.from({ length: CLASSES }, (_, i) => ({ school_id: S, name: `Grade ${i + 1}`, order_index: i + 1 })));
const classSubjects = classes.flatMap((c) => subjects.slice(0, 5).map((s) => ({ school_id: S, class_id: c.id, subject_id: s.id })));
await insert("class_subjects", classSubjects, { select: false });

const teacherUser = await createLogin(S, { email: "teacher.one@lakeview.test", fullName: "Lakeview Teacher One", roles: ["TEACHER"] });
const teachers = await insert("teachers", Array.from({ length: TEACHERS }, (_, i) => ({
  school_id: S,
  user_id: i === 0 ? teacherUser.id : null,
  employee_no: `LV-T${String(i + 1).padStart(3, "0")}`,
  first_name: pick(FIRST, i * 3),
  last_name: pick(LAST, i * 7),
  display_name: i === 0 ? "Lakeview Teacher One" : `${pick(FIRST, i * 3)} ${pick(LAST, i * 7)}`,
  email: i === 0 ? teacherUser.email : null,
  date_of_joining: "2020-06-01",
})));
const sections = [];
for (const [ci, c] of classes.entries()) {
  for (let s = 0; s < SECTIONS_PER_CLASS; s++) {
    sections.push({ school_id: S, class_id: c.id, name: "ABCD"[s], order_index: s + 1, room: `${ci + 1}0${s + 1}`, class_teacher_id: teachers[(ci * SECTIONS_PER_CLASS + s) % TEACHERS].id });
  }
}
const secRows = await insert("sections", sections);
const ts = [];
secRows.forEach((sec, si) => subjects.slice(0, 5).forEach((sub, k) => ts.push({
  school_id: S, teacher_id: teachers[(si * 5 + k) % TEACHERS].id, subject_id: sub.id, section_id: sec.id, academic_year_id: AY,
})));
await insert("teacher_subjects", ts, { select: false });
log(`${classes.length} classes, ${secRows.length} sections, ${teachers.length} teachers`);

// Students + enrollments
const studentRows = [];
let n = 0;
for (const sec of secRows) {
  for (let r = 1; r <= STUDENTS_PER_SECTION; r++) {
    n++;
    studentRows.push({
      school_id: S, admission_no: `LV-${String(n).padStart(4, "0")}`,
      first_name: pick(FIRST, n * 7), last_name: pick(LAST, n * 3), display_name: `${pick(FIRST, n * 7)} ${pick(LAST, n * 3)}`,
      gender: n % 2 ? "male" : "female", admission_date: "2026-04-01",
      class_id: sec.class_id, section_id: sec.id, roll_number: String(r), guardian_phone: `98${String(n).padStart(8, "0")}`,
    });
  }
}
const students = await insert("students", studentRows);
await insert("student_enrollments", students.map((s) => ({
  school_id: S, student_id: s.id, academic_year_id: AY, class_id: s.class_id, section_id: s.section_id, roll_number: s.roll_number,
})), { select: false });
const studentUser = await createLogin(S, { email: "student.one@lakeview.test", fullName: students[0].display_name, roles: ["STUDENT"] });
must(await db.from("students").update({ user_id: studentUser.id }).eq("id", students[0].id), "link student login");
log(`${students.length} students`);

// Parents: one per student, except every 10th student shares the previous student's parent (siblings).
const parentUser = await createLogin(S, { email: "parent.one@lakeview.test", fullName: "Lakeview Parent One", phone: "9800000001", roles: ["PARENT"] });
const parentSpecs = [];
const links = [];
students.forEach((st, i) => {
  if (i % 10 === 9 && i > 0) {
    links.push({ studentIdx: i, parentIdx: parentSpecs.length - 1 });
    return;
  }
  parentSpecs.push({ school_id: S, full_name: `Parent of ${st.display_name}`, phone: `97${String(i + 1).padStart(8, "0")}` });
  links.push({ studentIdx: i, parentIdx: parentSpecs.length - 1 });
});
// Parent One = parent of students 0 and a student in another class (index 600).
parentSpecs[0] = { ...parentSpecs[0], user_id: parentUser.id, full_name: "Lakeview Parent One", phone: "9800000001", email: parentUser.email };
const parents = await insert("parents", parentSpecs);
links.push({ studentIdx: 600, parentIdx: 0 });
await insert("student_parents", links.map((l, i) => ({
  student_id: students[l.studentIdx].id, parent_id: parents[l.parentIdx].id, relation: i % 2 ? "mother" : "father", is_primary: true,
})).filter((v, i, a) => a.findIndex((x) => x.student_id === v.student_id && x.parent_id === v.parent_id) === i), { select: false });
log(`${parents.length} parents`);

// Attendance
const days = recentWeekdays(SCHOOL_DAYS);
const sessionRows = secRows.flatMap((sec) => days.map((d) => ({
  school_id: S, academic_year_id: AY, section_id: sec.id, attendance_date: d, status: "SUBMITTED", created_by: admin.id, updated_by: admin.id,
})));
const sessions = await insert("attendance_sessions", sessionRows);
const bySection = new Map();
for (const st of students) (bySection.get(st.section_id) ?? bySection.set(st.section_id, []).get(st.section_id)).push(st);
const recs = [];
for (const se of sessions) {
  for (const st of bySection.get(se.section_id)) {
    const x = rand();
    recs.push({ school_id: S, attendance_session_id: se.id, student_id: st.id, status: x < 0.06 ? "ABSENT" : x < 0.08 ? "LEAVE" : "PRESENT", updated_by: admin.id });
  }
}
await insert("attendance_records", recs, { select: false, batch: 2000 });
log(`${sessions.length} attendance sessions, ${recs.length} records`);

// Grading, exams, marks
const grading = await insertOne("grading_systems", { school_id: S, name: "CBSE 9-point", is_default: true });
await insert("grading_rules", GRADE_BANDS.map(([grade, min, max, gp]) => ({ school_id: S, grading_system_id: grading.id, grade, min_percentage: min, max_percentage: max, grade_point: gp })), { select: false });
const examDefs = [["Unit Test 1", "2026-07-14", true], ["Half Yearly", "2026-09-22", true], ["Unit Test 2", "2026-12-08", false]];
const exams = await insert("exams", classes.flatMap((c) => examDefs.map(([name, start]) => ({
  school_id: S, academic_year_id: AY, class_id: c.id, name, starts_on: start, ends_on: iso(addDays(new Date(`${start}T00:00:00Z`), 6)),
}))));
const examSubjects = await insert("exam_subjects", exams.flatMap((e) => {
  const published = examDefs.find(([nm]) => nm === e.name)[2];
  return subjects.slice(0, 5).map((s, k) => ({
    school_id: S, exam_id: e.id, subject_id: s.id, max_marks: 100, passing_marks: 33,
    exam_date: iso(addDays(new Date(`${e.starts_on}T00:00:00Z`), k)), start_time: "09:00", end_time: "12:00",
    is_locked: published, is_published: published,
  }));
}));
const examById = new Map(exams.map((e) => [e.id, e]));
const byClass = new Map();
for (const st of students) (byClass.get(st.class_id) ?? byClass.set(st.class_id, []).get(st.class_id)).push(st);
const marks = [];
for (const es of examSubjects) {
  const e = examById.get(es.exam_id);
  if (e.name === "Unit Test 2") continue; // not held yet
  for (const st of byClass.get(e.class_id)) {
    const v = Math.round(35 + rand() * 65);
    marks.push({ school_id: S, exam_subject_id: es.id, student_id: st.id, marks_obtained: v, grade: gradeFor(v, 100), entered_by: admin.id, updated_by: admin.id });
  }
}
await insert("marks", marks, { select: false, batch: 2000 });
log(`${exams.length} exams, ${examSubjects.length} exam subjects, ${marks.length} marks`);

// Timetable: teacher index differs per section at every (day, period), so no teacher clashes.
const times = [["08:00", "08:40"], ["08:40", "09:20"], ["09:35", "10:15"], ["10:15", "10:55"], ["11:10", "11:50"], ["11:50", "12:30"], ["13:10", "13:50"], ["13:50", "14:30"]];
const slots = [];
secRows.forEach((sec, si) => {
  for (let d = 1; d <= 5; d++) {
    for (let p = 1; p <= PERIODS; p++) {
      slots.push({
        school_id: S, academic_year_id: AY, section_id: sec.id, subject_id: subjects[(si + d + p) % 6].id,
        teacher_id: teachers[(si + p * 7 + d * 13) % TEACHERS].id, day_of_week: d, period_index: p,
        starts_at: times[p - 1][0], ends_at: times[p - 1][1], room: sec.room,
      });
    }
  }
});
await insert("timetable_slots", slots, { select: false });
log(`${slots.length} timetable slots`);

// Fees
const structures = await insert("fee_structures", classes.map((c, i) => ({
  school_id: S, academic_year_id: AY, class_id: c.id, name: `${c.name} annual fee 2026-27`, due_date: "2026-08-31", is_active: true,
})));
await insert("fee_components", structures.flatMap((fs, i) => [
  { school_id: S, fee_structure_id: fs.id, name: "Tuition", amount: 30000 + i * 1500 },
  { school_id: S, fee_structure_id: fs.id, name: "Transport", amount: 8000 },
  { school_id: S, fee_structure_id: fs.id, name: "Activities", amount: 2000 },
]), { select: false });
const structByClass = new Map(structures.map((fs, i) => [fs.class_id, { fs, total: 40000 + i * 1500 }]));
const assignments = await insert("student_fees", students.map((st) => ({
  school_id: S, student_id: st.id, fee_structure_id: structByClass.get(st.class_id).fs.id, total_amount: structByClass.get(st.class_id).total, due_date: "2026-08-31",
})));
const payments = assignments.filter((_, i) => i % 3 !== 2).map((a, i) => ({
  school_id: S, student_fee_id: a.id, amount: i % 2 ? Number(a.total_amount) : Math.round(Number(a.total_amount) / 2),
  paid_on: "2026-07-01", mode: i % 4 ? "BANK_TRANSFER" : "CASH", reference_no: `LV-R${i}`, recorded_by: admin.id, verified_by: accounts.id,
}));
await insert("fee_payment_records", payments, { select: false });
log(`${structures.length} fee structures, ${assignments.length} assignments, ${payments.length} payments`);

// Homework + notices
const hw = [];
secRows.forEach((sec, si) => {
  for (let k = 0; k < 10; k++) {
    const due = addDays(TODAY, k - 5);
    hw.push({
      school_id: S, academic_year_id: AY, section_id: sec.id, subject_id: subjects[k % 5].id, teacher_id: teachers[(si * 5 + (k % 5)) % TEACHERS].id,
      title: `${subjects[k % 5].name} practice set ${k + 1}`, description: "Complete the exercises from the textbook chapter.",
      assigned_on: iso(addDays(due, -3)), due_date: iso(due),
    });
  }
});
await insert("homework", hw, { select: false });
await insert("notices", Array.from({ length: 40 }, (_, i) => ({
  school_id: S, title: `School notice ${i + 1}`, content: "Details of the announcement for students and parents.", category: "GENERAL",
  is_published: true, published_at: addDays(TODAY, -i).toISOString(), created_by: admin.id,
})), { select: false });
log(`${hw.length} homework, 40 notices`);
log("done");
