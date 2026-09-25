import { ok } from "@/lib/api/response";

/** Liveness probe for the /api/v1 REST shell. No auth required. */
export async function GET() {
  return ok({ service: "simplin-school-erp", version: "v1", status: "ok" });
}
