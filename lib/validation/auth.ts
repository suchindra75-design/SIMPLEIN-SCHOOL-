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

/**
 * Request a password reset using the same identifier used to sign in
 * (admission number, phone, employee ID or email, resolved per role).
 */
export const passwordResetRequestSchema = z.object({
  role: z.enum(["STUDENT", "PARENT", "TEACHER", "ADMIN", "SCHOOL_ADMIN"]).default("ADMIN"),
  identifier: z.string().trim().min(1, "Identifier is required").max(256),
});

/**
 * Set a new password after following a recovery link. Minimum length is 8
 * (stricter than Supabase's configured minimum); Supabase Auth remains the
 * source of truth and will also reject weaker passwords.
 */
export const passwordUpdateSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").max(256),
    confirmPassword: z.string().min(1, "Confirm your password").max(256),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordUpdateInput = z.infer<typeof passwordUpdateSchema>;
