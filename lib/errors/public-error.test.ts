import { afterEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ForbiddenError, TenantBoundaryError } from "@/lib/auth/session";
import { GENERIC_ERROR_MESSAGE, publicErrorMessage, redactForLog } from "@/lib/errors/public-error";
import { ConflictError, DatabaseError, NotFoundError, throwForPostgrest } from "@/lib/services/errors";

afterEach(() => vi.restoreAllMocks());

describe("publicErrorMessage", () => {
  it("passes through messages the app writes for users", () => {
    expect(publicErrorMessage(new ConflictError("Record is already voided"), "t")).toBe("Record is already voided");
    expect(publicErrorMessage(new NotFoundError("Payment record not found"), "t")).toBe("Payment record not found");
    expect(publicErrorMessage(new ForbiddenError("Only School Admins can modify people records"), "t")).toBe(
      "Only School Admins can modify people records",
    );
    expect(publicErrorMessage(new TenantBoundaryError(), "t")).toBe("Not found");
  });

  it("replaces database errors with a generic message and logs a redacted line", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = new DatabaseError(
      'insert or update on table "students" violates foreign key constraint "students_section_id_fkey": Key (section_id)=(abc) is not present; parent ramesh.sharma@greenfield.test 9876500301',
      "23503",
    );
    const message = publicErrorMessage(raw, "admin-action");
    expect(message).toMatch(new RegExp(`^${GENERIC_ERROR_MESSAGE.replace(/[.]/g, "\\.")} \\(Reference: [A-Z0-9]{6}\\)$`));
    expect(message).not.toMatch(/students|constraint|section_id/);

    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(log.mock.calls[0]![0])) as Record<string, string>;
    expect(line).toMatchObject({ level: "error", scope: "admin-action", name: "DatabaseError", code: "23503" });
    expect(message).toContain(line["reference"]!);
    expect(line["message"]).not.toMatch(/ramesh|greenfield\.test|9876500301|students_section_id_fkey|\(abc\)/);
  });

  it("summarises validation errors by field", () => {
    const result = z.object({ amount: z.number().positive() }).safeParse({ amount: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(publicErrorMessage(result.error, "t")).toMatch(/^Please check the form \(amount\): /);
    }
  });

  it("re-throws Next.js redirects instead of turning them into messages", () => {
    let thrown: unknown;
    try {
      redirect("/admin");
    } catch (error) {
      thrown = error;
    }
    expect(() => publicErrorMessage(thrown, "t")).toThrow();
  });
});

describe("redactForLog", () => {
  it("removes quoted values, key values, e-mails and phone-like numbers", () => {
    expect(redactForLog('duplicate key value violates unique constraint "students_school_admission_key"')).toBe(
      'duplicate key value violates unique constraint "…"',
    );
    expect(redactForLog("Key (admission_no)=(GPS-2026-001) already exists.")).toBe("Key (…)=(…) already exists.");
    expect(redactForLog("sent to a.b@example.com")).toBe("sent to [email]");
    expect(redactForLog("phone +91 98765 00301 failed")).toBe("phone [number] failed");
  });
});

describe("throwForPostgrest", () => {
  it("shows database business-rule messages (SF001) as conflicts", () => {
    expect(() => throwForPostgrest({ code: "SF001", message: "A voided payment cannot be restored." })).toThrow(
      new ConflictError("A voided payment cannot be restored."),
    );
  });

  it("replaces raw integrity messages with safe text", () => {
    try {
      throwForPostgrest({ code: "23503", message: 'violates foreign key constraint "x_fkey"' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as Error).message).not.toMatch(/fkey|constraint/);
    }
  });

  it("wraps anything else as an internal DatabaseError (logged, not shown)", () => {
    try {
      throwForPostgrest({ code: "57014", message: "canceling statement due to statement timeout" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseError);
      expect((error as DatabaseError).code).toBe("57014");
    }
  });
});

describe("DatabaseError redaction (L7)", () => {
  it("never carries submitted values, so even an uncaught one logged by Next.js is safe", () => {
    const error = new DatabaseError('invalid input syntax for type uuid: "ramesh.sharma@greenfield.test 9876500301"', "22P02");
    expect(error.message).not.toMatch(/ramesh|greenfield|9876500301/);
    expect(error.code).toBe("22P02");
  });
});
