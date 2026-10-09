import { z } from "zod";

export const roleLoginSchema = z.object({
  role: z.enum(["STUDENT", "PARENT", "TEACHER", "ADMIN", "SCHOOL_ADMIN"]).default("ADMIN"),
  identifier: z.string().trim().min(1, "Identifier is required"),
  password: z.string().min(1, "Password is required").max(256),
});

/** Standard email login schema + role-aware schema */
export const loginSchema = z.object({
  role: z.enum(["STUDENT", "PARENT", "TEACHER", "ADMIN", "SCHOOL_ADMIN"]).optional(),
  identifier: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().optional(),
  password: z.string().min(1, "Password is required").max(256),
}).refine((data) => data.email !== undefined || data.identifier !== undefined, {
  message: "Email or identifier is required",
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RoleLoginInput = z.infer<typeof roleLoginSchema>;
