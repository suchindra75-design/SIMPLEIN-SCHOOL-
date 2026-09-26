import { z } from "zod";
import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/session";
import { routeErrorResponse } from "@/lib/services/errors";
import {
  buildReportCard,
  generateReportCard,
} from "@/lib/services/report-cards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ examId: z.string().uuid() });

/** JSON preview of the report card (admin/teacher-scope/parent+published). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { examId } = z
      .object({ examId: z.string().uuid() })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = await createServerSupabaseClient();
    return ok(await buildReportCard(db, ctx, (await params).studentId, examId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/** Generate (or regenerate) the snapshot + PDF. Admin only, audited. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const ctx = await requireAuth();
    const body: unknown = await request.json();
    const { examId } = bodySchema.parse(body);
    const db = await createServerSupabaseClient();
    return ok(
      await generateReportCard(db, ctx, (await params).studentId, examId),
      undefined,
      201,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
