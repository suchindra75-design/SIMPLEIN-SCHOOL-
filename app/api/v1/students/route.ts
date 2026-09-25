import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createStudent, listStudents } from "@/lib/services/students";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  studentCreateSchema,
  studentFiltersSchema,
} from "@/lib/validation/people";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const q = studentFiltersSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    const { students, total } = await listStudents(db, ctx, q);
    return ok(students, { page: q.page, limit: q.limit, total });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = studentCreateSchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(await createStudent(db, ctx, input), undefined, 201);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
