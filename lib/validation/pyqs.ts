import { z } from "zod";

const uuidStr = z.string().uuid();

/** POST /api/v1/pyqs (multipart: file + optional solution/answerKey + metadata). */
export const pyqCreateSchema = z.object({
  classId: uuidStr,
  subjectId: uuidStr,
  yearLabel: z.string().trim().min(2).max(20),
  examBoardName: z.string().trim().min(1).max(120),
  title: z.string().trim().max(200).nullish(),
});

export type PyqCreateInput = z.infer<typeof pyqCreateSchema>;

/** PATCH /api/v1/pyqs/:id (metadata). */
export const pyqUpdateSchema = z.object({
  yearLabel: z.string().trim().min(2).max(20).optional(),
  examBoardName: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().max(200).nullish(),
});

export type PyqUpdateInput = z.infer<typeof pyqUpdateSchema>;
