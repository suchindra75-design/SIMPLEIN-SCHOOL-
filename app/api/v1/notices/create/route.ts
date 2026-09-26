import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import { createNotice } from "@/lib/services/notices";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
  category: z
    .enum(["GENERAL", "CLASS", "SECTION", "EXAM", "HOLIDAY", "URGENT"])
    .default("GENERAL"),
  audience: z
    .object({
      type: z.enum(["SCHOOL", "CLASS", "SECTION", "TEACHERS", "PARENTS"]),
      classId: z.string().uuid().nullish(),
      sectionId: z.string().uuid().nullish(),
    })
    .refine(
      (a) =>
        (a.type === "CLASS" && a.classId !== undefined && a.classId !== null) ||
        (a.type === "SECTION" && a.sectionId !== undefined && a.sectionId !== null) ||
        (a.type !== "CLASS" && a.type !== "SECTION"),
      { message: "CLASS/SECTION audiences require their id" },
    ),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullish(),
});

/** Create a notice + target. Admin only, audited (unpublished until publish). */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const input = bodySchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await createNotice(db, ctx, {
        title: input.title,
        content: input.content,
        category: input.category,
        audience: {
          type: input.audience.type,
          classId: input.audience.classId,
          sectionId: input.audience.sectionId,
        },
        expiresAt: input.expiresAt,
      }),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
