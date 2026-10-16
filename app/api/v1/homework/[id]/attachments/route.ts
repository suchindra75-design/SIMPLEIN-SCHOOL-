import { declaredBodyTooLarge } from "@/lib/uploads/limits";
import { fail, ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { addHomeworkAttachment } from "@/lib/services/homework";
import { MAX_HOMEWORK_FILE_BYTES } from "@/lib/services/storage";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Multipart upload { file } → validated + stored privately + registered.
 * Author-teacher or admin, audited. ≤4 MB, PDF/images/Office (macros blocked).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (declaredBodyTooLarge(request.headers.get("content-length"))) {
      return fail("PAYLOAD_TOO_LARGE", "Upload is too large: files must be 4 MB or less in total");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return routeErrorResponse(
        new Error("Attach a file in the 'file' field"),
      );
    }
    if (file.size > MAX_HOMEWORK_FILE_BYTES) {
      return fail("VALIDATION_ERROR", "File must be under 4 MB");
    }
    const db = await createServerSupabaseClient();
    return ok(
      await addHomeworkAttachment(db, ctx, (await params).id, {
        name: file.name,
        type: file.type,
        size: file.size,
        bytes: await file.arrayBuffer(),
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
