import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

/** POST /api/v1/homework/sections/:sectionId (create). */
export const homeworkCreateSchema = z
  .object({
    subjectId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(5000),
    assignedOn: dateStr.optional(),
    dueDate: dateStr,
  })
  .refine((h) => h.assignedOn === undefined || h.dueDate >= h.assignedOn, {
    message: "Due date must be on or after the assigned date",
  });

export type HomeworkCreateInput = z.infer<typeof homeworkCreateSchema>;

/** PATCH /api/v1/homework/:id. */
export const homeworkUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    dueDate: dateStr.optional(),
    assignedOn: dateStr.optional(),
  })
  .refine(
    (h) =>
      h.assignedOn === undefined ||
      h.dueDate === undefined ||
      h.dueDate >= h.assignedOn,
    { message: "Due date must be on or after the assigned date" },
  );

export type HomeworkUpdateInput = z.infer<typeof homeworkUpdateSchema>;
