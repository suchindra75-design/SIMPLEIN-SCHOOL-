import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import {
  createUserWithRole,
  listUsers,
} from "@/lib/services/users";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { paginationSchema, queryBoolSchema } from "@/lib/validation/common";
import { APP_ROLES } from "@/lib/auth/rbac";
import { userCreateSchema } from "@/lib/validation/people";

export const dynamic = "force-dynamic";

const listQuerySchema = paginationSchema.extend({
  role: z.enum(APP_ROLES).optional(),
  isActive: queryBoolSchema.optional(),
  search: z.string().max(200).optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const q = listQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const db = await createServerSupabaseClient();
    const { users, total } = await listUsers(db, ctx, q);
    return ok(users, { page: q.page, limit: q.limit, total });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = userCreateSchema.parse(body);
    if (
      (input.role === "TEACHER" && input.link.teacherId === undefined) ||
      (input.role === "PARENT" && input.link.parentId === undefined) ||
      (input.role === "STUDENT" && input.link.studentId === undefined)
    ) {
      return fail("VALIDATION_ERROR", "Role requires its matching profile link");
    }
    const db = await createServerSupabaseClient();
    const created = await createUserWithRole(db, ctx, input);
    return ok(created, undefined, 201);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
