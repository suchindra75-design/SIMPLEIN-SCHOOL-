import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const timeStr = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24-hour)");
const marks = z.coerce.number().min(0).max(1000);

/** Per-subject exam configuration (marks + schedule date/time). */
export const examSubjectSchema = z
  .object({
    subjectId: z.string().uuid(),
    maxMarks: marks.refine((v) => v > 0, { message: "Max marks must be > 0" }),
    passingMarks: marks,
    examDate: dateStr.optional(),
    startTime: timeStr.optional(),
    endTime: timeStr.optional(),
  })
  .refine(
    (s) =>
      s.passingMarks <= s.maxMarks &&
      (s.startTime === undefined || s.endTime === undefined || s.startTime < s.endTime),
    {
      message:
        "Passing marks must be ≤ max marks, and end time must be after start time",
    },
  );

export type ExamSubjectInput = z.infer<typeof examSubjectSchema>;

/** POST /api/v1/exams (create). */
export const examCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    academicYearId: z.string().uuid(),
    classId: z.string().uuid(),
    startsOn: dateStr,
    endsOn: dateStr,
    subjects: z.array(examSubjectSchema).max(30).default([]),
  })
  .refine((e) => e.endsOn >= e.startsOn, {
    message: "End date must be on or after the start date",
  });

export type ExamCreateInput = z.infer<typeof examCreateSchema>;

/** PATCH /api/v1/exams/:id. */
export const examUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    startsOn: dateStr.optional(),
    endsOn: dateStr.optional(),
  })
  .refine(
    (e) =>
      e.startsOn === undefined || e.endsOn === undefined || e.endsOn >= e.startsOn,
    { message: "End date must be on or after the start date" },
  );

export type ExamUpdateInput = z.infer<typeof examUpdateSchema>;

/** Per-subject config update (exam subjects; re-validated). */
export const examSubjectUpdateSchema = examSubjectSchema.innerType().partial();

export type ExamSubjectUpdateInput = z.infer<typeof examSubjectUpdateSchema>;

/** PUT /api/v1/exam-subjects/:id/schedule (room/invigilator). */
export const examScheduleSchema = z.object({
  room: z.string().trim().max(80).nullish(),
  invigilatorId: z.string().uuid().nullish(),
});

export type ExamScheduleInput = z.infer<typeof examScheduleSchema>;
