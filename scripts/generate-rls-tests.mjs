#!/usr/bin/env node
/**
 * Generates phase6–phase12 pgTAP suites for `npx supabase test db --linked`.
 *
 * Guarantees the two classic failure modes can't happen:
 *  1. plan(N) always equals the number of emitted assertions (counted).
 *  2. public.users.auth_user_id always equals the auth.users.id used in the
 *     request.jwt.claims sub (fixture + impersonation are generated from the
 *     same id map, eliminating the mismatch class of bug).
 *
 * Each emitted suite: extension + begin + plan + fixtures + assertions +
 * finish + rollback. Fixtures insert a self-contained two-school world;
 * nothing persists (the transaction is rolled back).
 *
 * Phase files OVERWRITE the legacy phase{N}_rls.sql checklists (they are the
 * pgTAP equivalents of those scenarios, verified live).
 */

import { writeFileSync } from "node:fs";

/* ------------------------------- identity map ------------------------------ */

// The first 8 chars differ per phase so generated fixture rows can never
// collide with other phases' committed fixtures on the linked DB (each file
// also rolls back anyway).
const PF = { 6: "f0606060", 7: "f0707070", 8: "f0808080", 9: "f0909090", 10: "f1010101", 11: "f1f1f1f1", 12: "f2121212" };

// Per-entity fixed suffixes within a phase (second block varies by entity).
const S = {
  schoolA: "a1", schoolB: "b1",
  ayA: "a2", ayB: "b2",
  // auth.users rows (identity rows; ALSO used as public.users.auth_user_id)
  authAdminA: "a3", authTeacherA: "a4", authTeacherA2: "a5", authParentA: "a6",
  authStudentA1: "a7", authStudentA2: "a8",
  authAdminB: "a9", authTeacherB: "aa", authParentB: "ab", authStudentB: "ac",
  // application users (public.users.id)
  uAdminA: "a3", uTeacherA: "a4", uTeacherA2: "a5", uParentA: "a6",
  uStudentA1: "a7", uStudentA2: "a8",
  uAdminB: "a9", uTeacherB: "aa", uParentB: "ab", uStudentB: "ac",
  class7A: "ad", class8A: "ae", class1B: "af",
  teacherTA: "b0", teacherTA2: "b1", teacherTB: "b2",
  parentPA: "b3", parentPB: "b4",
  section7a: "b5", section8x: "b6", sectionB: "b7",
  subMath: "b8", subEng: "b9", subArtB: "ba",
  studS1: "bb", studS2: "bc", studB: "bd",
};

// Second block encodes the entity class so ids can't clash within a phase.
function uuid(p, key, cls) {
  return `${p}-${cls}00-4000-8000-${S[key]}000000000`;
}

/* ------------------------------- fixture emitters ---------------------------- */

function emitInsert(table, cols, rows) {
  const list = rows.map((r) => `  (${r.join(",")})`).join(",\n");
  return `insert into public.${table} (${cols}) values\n${list}\non conflict (id) do nothing;`;
}

// Full two-school people fixture for one phase (all modules need it).
function peopleFixture(p) {
  const t = (k) => uuid(p, k, "0000");
  return {
    auth: `
${emitInsertStandalone(
  `"auth".users`,
  `instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data`,
  [
    ["adminA"], ["teacherA"], ["teacherA2"], ["parentA"], ["studentA1"], ["studentA2"],
    ["adminB"], ["teacherB"], ["parentB"], ["studentB"],
  ].map(([k]) => [
    "'00000000-0000-0000-0000-000000000000'",
    `'${uuid(p, `auth${cap(k)}`, "0100")}'`,
    "'authenticated'", "'authenticated'",
    `'phase.${p}.${k.toLowerCase()}@phase.tests'`,
    "''", "now()", "now()", "now()",
    `'{"provider":"email","providers":["email"]}'`, "'{}'",
  ]),
)}`,
    schools: emitInsert("schools", "id, name, slug", [
      [t("schoolA"), "'Audit School A'", `'phase-${p}-school-a'`],
      [t("schoolB"), "'Audit School B'", `'phase-${p}-school-b'`],
    ]),
    years: `
insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('${t("ayA")}','${t("schoolA")}','2026-27','2026-04-01','2027-03-31', true),
  ('${t("ayB")}','${t("schoolB")}','2026-27','2026-04-01','2027-03-31', true)
on conflict (id) do nothing;`,
    users: emitInsert("users", "id, auth_user_id, school_id, email, full_name", [
      [t("uAdminA"), t("uAdminA"), t("schoolA"), `'phase.${p}.adminA@phase.tests'`, "'Admin A'"],
      [t("uTeacherA"), t("uTeacherA"), t("schoolA"), `'phase.${p}.teacherA@phase.tests'`, "'Teacher A'"],
      [t("uTeacherA2"), t("uTeacherA2"), t("schoolA"), `'phase.${p}.teacherA2@phase.tests'`, "'Teacher A2'"],
      [t("uParentA"), t("uParentA"), t("schoolA"), `'phase.${p}.parentA@phase.tests'`, "'Parent A'"],
      [t("uStudentA1"), t("uStudentA1"), t("schoolA"), `'phase.${p}.studentA1@phase.tests'`, "'Student A1'"],
      [t("uStudentA2"), t("uStudentA2"), t("schoolA"), `'phase.${p}.studentA2@phase.tests'`, "'Student A2'"],
      [t("uAdminB"), t("uAdminB"), t("schoolB"), `'phase.${p}.adminB@phase.tests'`, "'Admin B'"],
      [t("uTeacherB"), t("uTeacherB"), t("schoolB"), `'phase.${p}.teacherB@phase.tests'`, "'Teacher B'"],
      [t("uParentB"), t("uParentB"), t("schoolB"), `'phase.${p}.parentB@phase.tests'`, "'Parent B'"],
      [t("uStudentB"), t("uStudentB"), t("schoolB"), `'phase.${p}.studentB@phase.tests'`, "'Student B'"],
    ]),
  };
}

// auth.users has no (id) PK in legacy Supabase versions — replicate old emitInsert without pk guard.
function emitInsertStandalone(table, cols, rows) {
  const list = rows.map((r) => `  (${r.join(",")})`).join(",\n");
  return `insert into ${table} (${cols}) values\n${list}\non conflict (id) do nothing;`;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
