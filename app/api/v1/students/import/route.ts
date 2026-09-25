import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import {
  confirmStudentImport,
  previewStudentImport,
} from "@/lib/services/imports";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MAX_IMPORT_BYTES,
  type ValidatedImportRow,
} from "@/lib/validation/import";

export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .max(200),
});

/**
 * POST multipart { file, mapping?, dryRun? } → validate + preview.
 * POST JSON { rows } (dryRun=false) → confirm a previewed batch.
 * Synchronous, capped at 200 rows / 2 MB. Admin only.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return fail("VALIDATION_ERROR", "Attach a .csv or .xlsx file as 'file'");
      }
      if (file.size > MAX_IMPORT_BYTES) {
        return fail("VALIDATION_ERROR", "File must be under 2 MB");
      }
      let mapping: Record<string, string> | undefined;
      const rawMapping = form.get("mapping");
      if (typeof rawMapping === "string" && rawMapping !== "") {
        try {
          mapping = z.record(z.string(), z.string()).parse(JSON.parse(rawMapping));
        } catch {
          return fail("VALIDATION_ERROR", "Invalid mapping JSON");
        }
      }
      const preview = await previewStudentImport(
        db,
        ctx,
        { name: file.name, bytes: await file.arrayBuffer() },
        mapping,
      );
      return ok(preview);
    }

    const body: unknown = await request.json();
    const { rows } = confirmSchema.parse(body);
    const result = await confirmStudentImport(
      db,
      ctx,
      rows as unknown as ValidatedImportRow[],
    );
    return ok(result, undefined, 201);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
