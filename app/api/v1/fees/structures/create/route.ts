import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createFeeStructure } from "@/lib/services/fees";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { feeStructureCreateSchema } from "@/lib/validation/fees";

export const dynamic = "force-dynamic";

/** Create a fee structure + components. Admin only, audited. */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = feeStructureCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await createFeeStructure(db, ctx, {
        name: input.name,
        academicYearId: input.academicYearId,
        classId: input.classId,
        dueDate: input.dueDate,
        components: input.components,
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
