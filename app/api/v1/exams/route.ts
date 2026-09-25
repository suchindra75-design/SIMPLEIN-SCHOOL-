import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createExam, listExams } from "@/lib/services/exams";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { examCreateSchema } from "@/lib/validation/exams";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  academicYearId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Auto-scoped exam list: admin → school; teacher → assigned classes; parent → children's classes. */
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const q = listQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    const { exams, total } = await listExams(db, ctx, q);
    return ok(exams, { page: q.page, limit: q.limit, total });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Create an exam with its subject configs. Admin only. */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = examCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await createExam(db, ctx, input), undefined, 201);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
