import { z } from "zod";

const timeStr = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24-hour)");

/** POST /api/v1/timetable/sections/:sectionId (create a slot). */
export const timetableSlotCreateSchema = z
  .object({
    subjectId: z.string().uuid().nullish(),
    teacherId: z.string().uuid().nullish(),
    academicYearId: z.string().uuid().nullish(),
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    periodIndex: z.coerce.number().int().min(0),
    startsAt: timeStr,
    endsAt: timeStr,
    room: z.string().trim().max(80).nullish(),
  })
  .refine((s) => s.endsAt > s.startsAt, {
    message: "End time must be after start time",
  });

export type TimetableSlotCreateInput = z.infer<typeof timetableSlotCreateSchema>;

/** PATCH /api/v1/timetable/slots/:id. */
export const timetableSlotUpdateSchema = timetableSlotCreateSchema.innerType().partial();

export type TimetableSlotUpdateInput = z.infer<typeof timetableSlotUpdateSchema>;
