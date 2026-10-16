import { fail, ok } from "@/lib/api/response";
import { checkRequestFiles, declaredBodyTooLarge } from "@/lib/uploads/limits";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createPyq } from "@/lib/services/pyqs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pyqCreateSchema } from "@/lib/validation/pyqs";

export const dynamic = "force-dynamic";

/**
 * Create a PYQ. Admin only, audited. Multipart: file (required),
 * solution?/answerKey? (optional) + metadata fields.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (declaredBodyTooLarge(request.headers.get("content-length"))) {
      return fail("PAYLOAD_TOO_LARGE", "Upload is too large: files must be 4 MB or less in total");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail("VALIDATION_ERROR", "Attach the question paper as 'file'");
    }
    const solutionRaw = form.get("solution");
    const answerKeyRaw = form.get("answerKey");
    // The question paper, solution and answer key share one request budget.
    const tooLarge = checkRequestFiles(
      [file, solutionRaw, answerKeyRaw].filter((f): f is File => f instanceof File),
    );
    if (tooLarge !== null) {
      return fail("PAYLOAD_TOO_LARGE", tooLarge);
    }
    const metadata = pyqCreateSchema.parse({
      classId: form.get("classId"),
      subjectId: form.get("subjectId"),
      yearLabel: form.get("yearLabel"),
      examBoardName: form.get("examBoardName"),
      title: form.get("title"),
    });
    const db = await createServerSupabaseClient();
    return ok(
      await createPyq(
        db,
        ctx,
        {
          classId: metadata.classId,
          subjectId: metadata.subjectId,
          yearLabel: metadata.yearLabel,
          examBoardName: metadata.examBoardName,
          title: metadata.title,
        },
        {
          file: {
            name: file.name,
            type: file.type,
            size: file.size,
            bytes: await file.arrayBuffer(),
          },
          solution:
            solutionRaw instanceof File
              ? {
                  name: solutionRaw.name,
                  type: solutionRaw.type,
                  size: solutionRaw.size,
                  bytes: await solutionRaw.arrayBuffer(),
                }
              : null,
          answerKey:
            answerKeyRaw instanceof File
              ? {
                  name: answerKeyRaw.name,
                  type: answerKeyRaw.type,
                  size: answerKeyRaw.size,
                  bytes: await answerKeyRaw.arrayBuffer(),
                }
              : null,
        },
      ),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
