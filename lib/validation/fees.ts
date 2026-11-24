import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const amount = z.coerce.number().min(0).max(100000000);

/** POST /api/v1/fees/structures (create with components). */
export const feeStructureCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  academicYearId: z.string().uuid(),
  classId: z.string().uuid().nullish(),
  dueDate: dateStr.nullish(),
  components: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        amount,
      }),
    )
    .min(1)
    .max(30),
});

export type FeeStructureCreateInput = z.infer<typeof feeStructureCreateSchema>;

/** PATCH /api/v1/fees/structures/:id. */
export const feeStructureUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  dueDate: dateStr.nullish(),
  isActive: z.boolean().optional(),
  components: z
    .array(z.object({ name: z.string().trim().min(1).max(120), amount }))
    .min(1)
    .max(30)
    .optional(),
});

export type FeeStructureUpdateInput = z.infer<typeof feeStructureUpdateSchema>;

/** POST /api/v1/fees/structures/:id/assign. */
export const feeAssignSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(500),
  totalAmount: amount.nullish(), // concession snapshot; defaults to structure total
  dueDate: dateStr.nullish(),
});

export type FeeAssignInput = z.infer<typeof feeAssignSchema>;

/** POST /api/v1/fees/student-fees/:studentFeeId/records (record a payment). */
export const feePaymentRecordSchema = z.object({
  amount: z.coerce.number().min(1).max(100000000),
  paidOn: dateStr,
  mode: z.enum(["CASH", "CHEQUE", "BANK_TRANSFER", "OTHER"]),
  referenceNo: z.string().trim().max(80).nullish(),
});

export type FeePaymentRecordInput = z.infer<typeof feePaymentRecordSchema>;

/** POST /api/v1/fees/payment-records/:id/void. */
export const feeVoidSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type FeeVoidInput = z.infer<typeof feeVoidSchema>;

/** POST /api/v1/payments/orders (start an online payment). */
export const paymentOrderCreateSchema = z.object({
  studentFeeId: z.string().uuid(),
  amount: z.coerce.number().min(1).max(10000000).nullish(),
});

/** POST /api/v1/payments/confirm (Razorpay Checkout success callback). */
export const paymentConfirmSchema = z.object({
  razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]{1,40}$/),
  razorpayPaymentId: z.string().regex(/^pay_[A-Za-z0-9]{1,40}$/),
  razorpaySignature: z.string().regex(/^[0-9a-f]{64}$/i),
});
