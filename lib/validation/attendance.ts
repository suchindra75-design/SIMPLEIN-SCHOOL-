import { z } from "zod";

/** Strongly typed attendance statuses (mirrors DB enum attendance_status). */
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LEAVE"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

/** POST /api/v1/attendance/sections/:sectionId (save/upsert). */
export const saveAttendanceSchema = z.object({
  date: dateStr,
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: attendanceStatusSchema,
        remark: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;

/** GET query schemas. */
export const attendanceDateQuerySchema = z.object({ date: dateStr });

export const attendanceRangeQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type AttendanceRangeQuery = z.infer<typeof attendanceRangeQuerySchema>;
