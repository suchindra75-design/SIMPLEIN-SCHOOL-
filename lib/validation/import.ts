import { z } from "zod";
import { genderSchema } from "@/lib/validation/people";

/**
 * Student import column format (documented in docs/STUDENT_IMPORT.md).
 * Headers are matched case-insensitively; spaces/underscores ignored.
 * A `mapping` object may rename file headers → canonical fields.
 */
export const IMPORT_COLUMNS = [
  "firstName",
  "middleName",
  "lastName",
  "admissionNo",
  "dob",
  "gender",
  "class",
  "section",
  "rollNumber",
  "parentName",
  "parentPhone",
  "guardianPhone",
  "address",
  "admissionDate",
] as const;

const HEADER_ALIASES: Record<string, string> = {
  firstname: "firstName",
  fname: "firstName",
  "first name": "firstName",
  name: "firstName", // full name fallback: split into first/last
  fullname: "firstName",
  "full name": "firstName",
  studentname: "firstName",
  "student name": "firstName",
  middlename: "middleName",
  "middle name": "middleName",
  lastname: "lastName",
  lname: "lastName",
  "last name": "lastName",
  surname: "lastName",
  admissionno: "admissionNo",
  "admission no": "admissionNo",
  "admission number": "admissionNo",
  admissionnumber: "admissionNo",
  "adm no": "admissionNo",
  admno: "admissionNo",
  rollno: "rollNumber",
  "roll no": "rollNumber",
  "roll number": "rollNumber",
  rollnumber: "rollNumber",
  dateofbirth: "dob",
  "date of birth": "dob",
  birthdate: "dob",
  "birth date": "dob",
  classname: "class",
  "class name": "class",
  grade: "class",
  sectionname: "section",
  "section name": "section",
  division: "section",
  parentname: "parentName",
  "parent name": "parentName",
  guardianname: "parentName",
  "guardian name": "parentName",
  fathername: "parentName",
  mothername: "parentName",
  parentphone: "parentPhone",
  "parent phone": "parentPhone",
  "parent mobile": "parentPhone",
  parentmobile: "parentPhone",
  guardianphone: "guardianPhone",
  phone: "guardianPhone",
  mobile: "guardianPhone",
  contact: "guardianPhone",
  address: "address",
  admissiondate: "admissionDate",
  "admission date": "admissionDate",
  dateofadmission: "admissionDate",
};

export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const importRowSchema = z.object({
  firstName: z.string().trim().min(1).max(200),
  middleName: z.string().trim().max(200).optional(),
  lastName: z.string().trim().max(200).default(""),
  admissionNo: z.string().trim().min(1).max(80),
  dob: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  class: z.string().trim().min(1).max(120),
  section: z.string().trim().min(1).max(40),
  rollNumber: z.string().trim().max(20).optional(),
  parentName: z.string().trim().max(200).optional(),
  parentPhone: z.string().trim().max(40).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  admissionDate: z.string().trim().optional(),
});

export type RawImportRow = Record<string, string>;

export interface ImportRowError {
  row: number;
  field: string;
  message: string;
}

export interface ValidatedImportRow {
  row: number;
  firstName: string;
  middleName?: string;
  lastName: string;
  admissionNo: string;
  dob?: string;
  gender?: "male" | "female" | "other";
  classId: string;
  sectionId: string;
  rollNumber?: string;
  parentName?: string;
  parentPhone?: string;
  guardianPhone?: string;
  address?: string;
  admissionDate?: string;
}

export interface ClassSectionRef {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
}

/** Normalize a header cell → canonical column (or null when unmapped). */
export function normalizeHeader(
  header: string,
  mapping?: Record<string, string>,
): string | null {
  const trimmed = header.trim();
  if (mapping !== undefined && mapping[trimmed] !== undefined) {
    const mapped = mapping[trimmed] as string;
    return (IMPORT_COLUMNS as readonly string[]).includes(mapped) ? mapped : null;
  }
  const key = trimmed.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if ((IMPORT_COLUMNS as readonly string[]).includes(trimmed)) return trimmed;
  return HEADER_ALIASES[key] ?? null;
}

/** Split a full-name fallback ("Rahul Sharma") into first/last. */
export function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  const first = parts.shift() ?? "";
  return { first, last: parts.join(" ") };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GENDERS = new Set(["male", "female", "other", "m", "f", "o"]);

function normalizeGender(raw: string): "male" | "female" | "other" | null {
  const v = raw.trim().toLowerCase();
  if (v === "male" || v === "m") return "male";
  if (v === "female" || v === "f") return "female";
  if (v === "other" || v === "o") return "other";
  return null;
}

/**
 * Validate parsed rows against school structure. Pure + unit-tested.
 * `catalog`: class name (lowercased) → { classId, sections: sectionName(lower) → sectionId }.
 * `existingAdmissions`: lowercased admission numbers already in the school.
 */
export function validateImportRows(
  rows: RawImportRow[],
  catalog: Map<string, { classId: string; sections: Map<string, string> }>,
  existingAdmissions: Set<string>,
): { valid: ValidatedImportRow[]; errors: ImportRowError[] } {
  const valid: ValidatedImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seenInFile = new Set<string>();

  rows.forEach((raw, index) => {
    const rowNumber = index + 2; // +header, 1-based
    const push = (field: string, message: string) =>
      errors.push({ row: rowNumber, field, message });

    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        push(String(issue.path[0] ?? "row"), issue.message);
      }
      return;
    }
    const r = parsed.data;
    let failed = false;
    const fail = (field: string, message: string) => {
      failed = true;
      push(field, message);
    };

    // Full-name fallback: "Name" mapped to firstName; split off last name.
    let firstName = r.firstName;
    let lastName = r.lastName;
    if (raw["__fromFullName"] === "1" || (lastName === "" && firstName.includes(" "))) {
      const split = splitFullName(firstName);
      if (split.first !== "") {
        firstName = split.first;
        lastName = split.last;
      }
    }

    const admissionKey = r.admissionNo.toLowerCase();
    if (existingAdmissions.has(admissionKey)) {
      fail("admissionNo", `Admission number ${r.admissionNo} already exists`);
    } else if (seenInFile.has(admissionKey)) {
      fail("admissionNo", `Duplicate admission number ${r.admissionNo} in file`);
    }

    const classEntry = catalog.get(r.class.trim().toLowerCase());
    if (classEntry === undefined) {
      fail("class", `Unknown class "${r.class}"`);
    }
    const sectionId = classEntry?.sections.get(r.section.trim().toLowerCase());
    if (classEntry !== undefined && sectionId === undefined) {
      fail("section", `Unknown section "${r.section}" in class "${r.class}"`);
    }

    if (r.dob !== undefined && r.dob !== "" && !DATE_RE.test(r.dob)) {
      fail("dob", "DOB must be YYYY-MM-DD");
    }
    let gender: "male" | "female" | "other" | undefined;
    if (r.gender !== undefined && r.gender !== "") {
      const g = normalizeGender(r.gender);
      if (g === null) fail("gender", 'Gender must be male/female/other');
      else gender = g;
    }
    if (
      r.admissionDate !== undefined &&
      r.admissionDate !== "" &&
      !DATE_RE.test(r.admissionDate)
    ) {
      fail("admissionDate", "Admission date must be YYYY-MM-DD");
    }

    if (failed || classEntry === undefined || sectionId === undefined) return;
    seenInFile.add(admissionKey);
    valid.push({
      row: rowNumber,
      firstName,
      middleName: r.middleName || undefined,
      lastName,
      admissionNo: r.admissionNo,
      dob: r.dob || undefined,
      gender,
      classId: classEntry.classId,
      sectionId,
      rollNumber: r.rollNumber || undefined,
      parentName: r.parentName || undefined,
      parentPhone: r.parentPhone || undefined,
      guardianPhone: r.guardianPhone || undefined,
      address: r.address || undefined,
      admissionDate: r.admissionDate || undefined,
    });
  });

  return { valid, errors };
}
