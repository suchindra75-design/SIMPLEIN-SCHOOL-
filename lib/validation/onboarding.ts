import { z } from "zod";
import { APP_ROLES } from "@/lib/auth/rbac";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * POST /api/v1/onboarding/school — creates a school plus its first admin.
 * Protected by the server-only ONBOARDING_SECRET bearer token (NOT a user
 * session), so ordinary browser users can never self-assign to a school.
 */
export const onboardingSchoolSchema = z.object({
  school: z.object({
    name: z.string().trim().min(2).max(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(80)
      .regex(slugPattern, "Slug must be lowercase letters, digits, hyphens"),
    address: z.string().trim().max(500).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    timezone: z.string().trim().min(1).max(80).default("Asia/Kolkata"),
  }),
  admin: z.object({
    email: z.string().trim().toLowerCase().email(),
    fullName: z.string().trim().min(2).max(200),
    phone: z.string().trim().max(40).optional(),
    password: z.string().min(10).max(256),
  }),
  roles: z
    .array(z.enum(APP_ROLES))
    .min(1)
    .default(["SCHOOL_ADMIN"] as const)
    .refine((roles) => roles.includes("SCHOOL_ADMIN"), {
      message: "Onboarding must grant SCHOOL_ADMIN",
    }),
});

export type OnboardingSchoolInput = z.infer<typeof onboardingSchoolSchema>;
