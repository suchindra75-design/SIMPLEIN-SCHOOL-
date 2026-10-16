import { declaredBodyTooLarge } from "@/lib/uploads/limits";
import { fail, ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { setNoticeAttachment } from "@/lib/services/notices";
import { MAX_HOMEWORK_FILE_BYTES } from "@/lib/services/storage";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Set the notice's single attachment. Admin only, audited. */
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
      return fail("VALIDATION_ERROR", "Attach a file in the 'file' field");
    }
    if (file.size > MAX_HOMEWORK_FILE_BYTES) {
      return fail("VALIDATION_ERROR", "File must be under 4 MB");
    }
    const db = await createServerSupabaseClient();
    return ok(
      await setNoticeAttachment(db, ctx, (await params).id, {
        name: file.name,
        type: file.type,
        size: file.size,
        bytes: await file.arrayBuffer(),
      }),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
