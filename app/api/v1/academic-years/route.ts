import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import {
  createAcademicYear,
  listAcademicYears,
} from "@/lib/services/years";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { academicYearCreateSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireAuth();
    const db = await createServerSupabaseClient();
    return ok(await listAcademicYears(db, ctx));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = academicYearCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await createAcademicYear(db, ctx, {
        name: input.name,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        isCurrent: input.isCurrent,
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
