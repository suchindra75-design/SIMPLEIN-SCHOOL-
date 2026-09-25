import { z } from "zod";

/** Shared pagination query schema for all list endpoints (docs/API.md). */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** Shared UUID path-param schema. */
export const idParamSchema = z.object({ id: z.string().uuid() });
