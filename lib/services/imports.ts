import * as XLSX from "xlsx";
import { assertCanWritePeople } from "@/lib/auth/scope";
import type { SessionContext } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/audit";
import {
  ConflictError,
  type DbClient,
} from "@/lib/services/errors";
import { createParent, linkChild } from "@/lib/services/parents";
import { createStudent } from "@/lib/services/students";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  normalizeHeader,
  validateImportRows,
  type ImportRowError,
  type RawImportRow,
  type ValidatedImportRow,
} from "@/lib/validation/import";

export interface ImportPreview {
  totalRows: number;
  truncated: boolean;
  validCount: number;
  errorCount: number;
  valid: ValidatedImportRow[];
  errors: ImportRowError[];
}

/**
 * Safe import flow: upload → parse → validate → preview → confirm.
 * Files never become public (parsed in memory, never stored). Everything is
 * tenant-scoped to the session school; class/section names resolve only
 * within that school.
 */
export async function previewStudentImport(
  db: DbClient,
  ctx: SessionContext,
  file: { name: string; bytes: ArrayBuffer },
  mapping?: Record<string, string>,
): Promise<ImportPreview> {
  assertCanWritePeople(ctx);
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw new ConflictError("Upload a .csv or .xlsx file");
  }
  if (file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new ConflictError("File must be non-empty and under 2 MB");
  }

  const workbook = XLSX.read(file.bytes, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  const sheet = firstSheet === undefined ? undefined : workbook.Sheets[firstSheet];
  if (sheet === undefined) {
    throw new ConflictError("Workbook contains no sheets");
  }
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (grid.length < 2) {
    throw new ConflictError("File needs a header row plus at least one data row");
  }
  const headers = (grid[0] as unknown[]).map((h) => String(h ?? ""));
  const columns = headers.map((h) => normalizeHeader(h, mapping));
  if (!columns.includes("firstName") || !columns.includes("admissionNo")) {
    throw new ConflictError("Missing required columns: name and admission number");
  }
  if (!columns.includes("class") || !columns.includes("section")) {
    throw new ConflictError("Missing required columns: class and section");
  }

  const rawRows: RawImportRow[] = [];
  for (const line of grid.slice(1)) {
    const cells = line as unknown[];
    const row: RawImportRow = {};
    let empty = true;
    cells.forEach((cell, i) => {
      const col = columns[i];
      if (col === null || col === undefined) return;
      const value = String(cell ?? "").trim();
      if (value !== "") empty = false;
      // Full-name fallback: a "Name" header maps to firstName; remember to split.
      if (col === "firstName" && headers[i] !== undefined && /^name$/i.test(headers[i].trim())) {
        row["__fromFullName"] = "1";
      }
      if (row[col] === undefined || row[col] === "") row[col] = value;
    });
    if (!empty) rawRows.push(row);
  }

  const truncated = rawRows.length > MAX_IMPORT_ROWS;
  const sliced = truncated ? rawRows.slice(0, MAX_IMPORT_ROWS) : rawRows;
  const catalog = await buildCatalog(db, ctx.profile.schoolId);
  const existing = await existingAdmissions(db, ctx.profile.schoolId);
  const { valid, errors } = validateImportRows(sliced, catalog, existing);
  return {
    totalRows: rawRows.length,
    truncated,
    validCount: valid.length,
    errorCount: errors.length,
    valid,
    errors,
  };
}

async function buildCatalog(
  db: DbClient,
  schoolId: string,
): Promise<Map<string, { classId: string; sections: Map<string, string> }>> {
  const { data: classes, error: classError } = await db
    .from("classes")
    .select("id, name, sections(id, name)")
    .eq("school_id", schoolId)
    .eq("is_active", true);
  if (classError !== null) throw new Error(classError.message);
  const catalog = new Map<string, { classId: string; sections: Map<string, string> }>();
  for (const c of classes as {
    id: string;
    name: string;
    sections: { id: string; name: string }[];
  }[]) {
    catalog.set(c.name.trim().toLowerCase(), {
      classId: c.id,
      sections: new Map(
        (c.sections ?? []).map((s) => [s.name.trim().toLowerCase(), s.id]),
      ),
    });
  }
  return catalog;
}

async function existingAdmissions(
  db: DbClient,
  schoolId: string,
): Promise<Set<string>> {
  const { data, error } = await db
    .from("students")
    .select("admission_no")
    .eq("school_id", schoolId);
  if (error !== null) throw new Error(error.message);
  return new Set(
    (data as { admission_no: string }[]).map((r) =>
      r.admission_no.toLowerCase(),
    ),
  );
}

export interface ImportResult {
  created: number;
  parentsLinked: number;
  failed: { row: number; admissionNo: string; message: string }[];
}

/** Confirm step: inserts preview-validated rows (re-validated structurally).
 *  Per-row failures are collected, never aborting the batch silently —
 *  every success is audited. */
export async function confirmStudentImport(
  db: DbClient,
  ctx: SessionContext,
  rows: ValidatedImportRow[],
): Promise<ImportResult> {
  assertCanWritePeople(ctx);
  if (rows.length === 0 || rows.length > MAX_IMPORT_ROWS) {
    throw new ConflictError(`Import between 1 and ${MAX_IMPORT_ROWS} rows`);
  }
  const result: ImportResult = { created: 0, parentsLinked: 0, failed: [] };
  for (const r of rows) {
    try {
      const { id } = await createStudent(db, ctx, {
        admissionNo: r.admissionNo,
        firstName: r.firstName,
        middleName: r.middleName,
        lastName: r.lastName,
        dob: r.dob,
        gender: r.gender,
        address: r.address,
        guardianPhone: r.guardianPhone ?? r.parentPhone,
        classId: r.classId,
        sectionId: r.sectionId,
        rollNumber: r.rollNumber,
        admissionDate: r.admissionDate,
      });
      result.created += 1;
      if (r.parentName !== undefined || r.parentPhone !== undefined) {
        const parentId = await findOrCreateParent(db, ctx, {
          name: r.parentName ?? "Guardian",
          phone: r.parentPhone,
        });
        await linkChild(db, ctx, parentId, id, {
          parentId,
          relation: "guardian",
          isPrimary: true,
        });
        result.parentsLinked += 1;
      }
    } catch (error) {
      result.failed.push({
        row: r.row,
        admissionNo: r.admissionNo,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  await logAudit(db, ctx, "students.imported", "students", null, {
    created: result.created,
    failed: result.failed.length,
  });
  return result;
}

async function findOrCreateParent(
  db: DbClient,
  ctx: SessionContext,
  parent: { name: string; phone?: string },
): Promise<string> {
  if (parent.phone !== undefined && parent.phone !== "") {
    const { data, error } = await db
      .from("parents")
      .select("id")
      .eq("school_id", ctx.profile.schoolId)
      .eq("phone", parent.phone)
      .maybeSingle();
    if (error !== null) throw new Error(error.message);
    if (data !== null) return (data as { id: string }).id;
  }
  const { id } = await createParent(db, ctx, {
    fullName: parent.name,
    phone: parent.phone,
  });
  return id;
}
