import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createPyq } from "@/lib/services/pyqs";
import { MAX_HOMEWORK_FILE_BYTES } from "@/lib/services/storage";
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
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return routeErrorResponse(new Error("Attach the question paper as 'file'"));
    }
    if (file.size > MAX_HOMEWORK_FILE_BYTES) {
      return routeErrorResponse(new Error("File must be under 10 MB"));
    }
    const solutionRaw = form.get("solution");
    const answerKeyRaw = form.get("answerKey");
    if (solutionRaw instanceof File && solutionRaw.size > MAX_HOMEWORK_FILE_BYTES) {
      return routeErrorResponse(new Error("Solution must be under 10 MB"));
    }
    if (answerKeyRaw instanceof File && answerKeyRaw.size > MAX_HOMEWORK_FILE_BYTES) {
      return routeErrorResponse(new Error("Answer key must be under 10 MB"));
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
