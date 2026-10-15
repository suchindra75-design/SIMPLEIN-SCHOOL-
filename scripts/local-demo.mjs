/**
 * Local demo accounts created by scripts/seed-local.mjs. Side-effect free so
 * integration tests can import it. These accounts exist only in LOCAL Supabase
 * databases seeded by that script; the password is not valid anywhere else.
 */
export const DEMO_PASSWORD = "SimplinDemo!2026";

/** role → login identifiers (email always works; other identifiers per role). */
export const DEMO_ACCOUNTS = {
  admin: { email: "admin@greenfield.test", role: "SCHOOL_ADMIN" },
  admin2: { email: "accounts@greenfield.test", role: "SCHOOL_ADMIN" },
  teacher: { email: "anita.verma@greenfield.test", employeeNo: "T-1001", role: "TEACHER" },
  teacher2: { email: "rahul.sharma@greenfield.test", employeeNo: "T-1002", role: "TEACHER" },
  parent: { email: "ramesh.sharma@greenfield.test", phone: "9876500301", role: "PARENT" },
  parent2: { email: "lakshmi.nair@greenfield.test", phone: "9876500302", role: "PARENT" },
  student: { email: "aarav.sharma@greenfield.test", admissionNo: "GPS-2026-001", role: "STUDENT" },
  student2: { email: "kavya.menon@greenfield.test", admissionNo: "GPS-2026-007", role: "STUDENT" },
  otherSchoolAdmin: { email: "admin@riverside.test", role: "SCHOOL_ADMIN" },
  otherSchoolTeacher: { email: "priya.das@riverside.test", employeeNo: "T-2001", role: "TEACHER" },
  otherSchoolStudent: { email: "riya.bose@riverside.test", admissionNo: "RDA-2026-001", role: "STUDENT" },
  otherSchoolParent: { email: "anil.bose@riverside.test", phone: "9876500401", role: "PARENT" },
};

/** Identifiers deliberately repeated across the two schools (both linked to logins). */
export const DUPLICATE_IDENTIFIERS = { admissionNo: "DUP-100", parentPhone: "9876500999" };
