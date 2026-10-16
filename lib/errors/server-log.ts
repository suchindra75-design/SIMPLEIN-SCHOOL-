/**
 * Server-side error logging without personal data or secrets. No imports, so
 * any module (including the API error mapper) can use it without cycles.
 */

/** Short random reference shown to the user and written to the server log. */
export function newReference(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * One JSON line per unexpected error: scope, reference, error name, database
 * code and a redacted message. Quoted values, e-mail addresses, phone-like and
 * long numbers are removed because database messages can echo submitted data
 * (names, admission numbers, phone numbers).
 */
export function logServerError(scope: string, error: unknown, reference: string): void {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;
  console.error(
    JSON.stringify({ level: "error", scope, reference, name, code, message: redactForLog(message) }),
  );
}

export function redactForLog(message: string): string {
  return message
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/\(([^()]*)\)=\(([^()]*)\)/g, "(…)=(…)")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "[number]")
    .slice(0, 300);
}
