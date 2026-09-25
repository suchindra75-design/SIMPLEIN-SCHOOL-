import { NextResponse } from "next/server";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof CODES)[number];

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Success envelope: { data } (+ optional meta for lists). */
export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    meta === undefined ? { data } : { data, meta },
    { status },
  );
}

/** Error envelope: { error: { code, message } }. Never leaks internals. */
export function fail(code: ErrorCode, message: string, details?: unknown) {
  const body: ApiErrorBody = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return NextResponse.json(body, { status: STATUS[code] });
}
