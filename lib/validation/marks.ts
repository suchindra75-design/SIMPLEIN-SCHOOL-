import { z } from "zod";

const marks = z.coerce.number().min(0).max(1000);

/** PUT /api/v1/marks/subjects/:examSubjectId (bulk save). */
export const saveMarksSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        marksObtained: marks.nullish(),
        isAbsent: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(500),
  version: z.number().int().min(1).optional(),
});

export type SaveMarksInput = z.infer<typeof saveMarksSchema>;

/** Grading rule + system schemas (schools define their own bands). */
export const gradingRuleSchema = z.object({
  minPercentage: z.coerce.number().min(0).max(100),
  maxPercentage: z.coerce.number().min(0).max(100),
  grade: z.string().trim().min(1).max(10),
  gradePoint: z.coerce.number().min(0).max(10).nullish(),
  remarkTemplate: z.string().trim().max(300).nullish(),
});

export const gradingSystemCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isDefault: z.boolean().default(false),
  rules: z.array(gradingRuleSchema).min(1).max(30),
});

export const gradingSystemUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isDefault: z.boolean().optional(),
  rules: z.array(gradingRuleSchema).min(1).max(30).optional(),
});

export type GradingSystemCreateInput = z.infer<typeof gradingSystemCreateSchema>;
export type GradingSystemUpdateInput = z.infer<typeof gradingSystemUpdateSchema>;
