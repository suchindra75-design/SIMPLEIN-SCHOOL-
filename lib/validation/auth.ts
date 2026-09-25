import { z } from "zod";

/** POST /api/v1/auth/* + login form. Supabase owns password policy server-side. */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required").max(256),
});

export type LoginInput = z.infer<typeof loginSchema>;
