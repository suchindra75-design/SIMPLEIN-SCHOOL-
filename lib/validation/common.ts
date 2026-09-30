import { z } from "zod";

/** Shared pagination query schema for all list endpoints (docs/API.md). */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** Shared UUID path-param schema. */
export const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * Strict boolean query param (?flag=true|false, also 1/0, or real booleans).
 * NOTE: z.coerce.boolean() maps EVERY non-empty string (including "false"
 * and "0") to true via Boolean() — it must never be used for query flags
 * (see Phase 14 runtime E2E: ?active=false never archived PYQs).
 */
export const queryBoolSchema = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");
