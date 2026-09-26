import { z } from "zod";

const uuidStr = z.string().uuid();

/** POST /api/v1/promotions/preview + /promote. */
export const promotionPreviewSchema = z.object({
  fromYearId: uuidStr,
  toYearId: uuidStr,
  classId: uuidStr.nullish(),
});

export const promotionAssignSchema = z.object({
  studentId: uuidStr,
  nextClassId: uuidStr.nullish(),
  nextSectionId: uuidStr.nullish(),
  hold: z.boolean().default(false),
});

export const promotionRunSchema = z.object({
  fromYearId: uuidStr,
  toYearId: uuidStr,
  assignments: z.array(promotionAssignSchema).min(1).max(500),
});

export type PromotionPreviewInput = z.infer<typeof promotionPreviewSchema>;
export type PromotionAssignInput = z.infer<typeof promotionAssignSchema>;
export type PromotionRunInput = z.infer<typeof promotionRunSchema>;
