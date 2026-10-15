import { describe, expect, it } from "vitest";
import {
  checkRate,
  clientIp,
  RateLimiter,
  tierFor,
} from "@/lib/security/rate-limit";

/**
 * Phase 13 security tests: rate limiting (now implemented — previously
 * documented-only), tier classification, header/IP extraction helpers.
 */
describe("checkRate (sliding window)", () => {
  it("allows requests under the limit", () => {
    const result = checkRate("AUTH", 1000, [500, 900]);
    expect(result.allowed).toBe(true);
  });

  it("blocks at the limit and computes Retry-After", () => {
    const tenHits = Array.from({ length: 10 }, (_, i) => 1000 - i * 1000);
    const result = checkRate("AUTH", 1000, tenHits);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("releases the window as old hits age out", () => {
    const tenHits = Array.from({ length: 10 }, (_, i) => 1000 - i * 1000);
    // All hits are ~10 minutes old → outside the AUTH window.
    const result = checkRate("AUTH", 1000 + 10 * 60 * 1000, tenHits);
    expect(result.allowed).toBe(true);
  });

  it("enforces per-tier limits independently", () => {
    // 10 hits → AUTH blocked, WRITE/READ fine (their limit is 120/600).
    const tenHits = Array.from({ length: 10 }, (_, i) => 1000 - i);
    expect(checkRate("AUTH", 1000, tenHits).allowed).toBe(false);
    expect(checkRate("WRITE", 1000, tenHits).allowed).toBe(true);
    expect(checkRate("READ", 1000, tenHits).allowed).toBe(true);
  });
});

describe("RateLimiter (in-memory store)", () => {
  it("tracks hits per key", () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("AUTH", "ip-1").allowed).toBe(true);
    }
    expect(limiter.check("AUTH", "ip-1").allowed).toBe(false);
    // A different key is unaffected.
    expect(limiter.check("AUTH", "ip-2").allowed).toBe(true);
  });
});

describe("tierFor (route classification)", () => {
  it("auth + onboarding → AUTH tier", () => {
    expect(tierFor("/api/v1/auth/session", "GET")).toBe("AUTH");
    expect(tierFor("/api/v1/onboarding/school", "POST")).toBe("AUTH");
  });

  it("api mutations → WRITE; api reads → READ", () => {
    expect(tierFor("/api/v1/students", "POST")).toBe("WRITE");
    expect(tierFor("/api/v1/attendance/sections/1/save", "PUT")).toBe("WRITE");
    expect(tierFor("/api/v1/students", "GET")).toBe("READ");
  });

  it("pages are not rate-limited", () => {
    expect(tierFor("/admin/students", "GET")).toBeNull();
    expect(tierFor("/login", "GET")).toBeNull();
  });

  it("sign-in submissions (POST /login) → LOGIN tier, 30 per 5 minutes", () => {
    expect(tierFor("/login", "POST")).toBe("LOGIN");
    const thirty = Array.from({ length: 30 }, (_, i) => 1000 + i);
    expect(checkRate("LOGIN", 2000, thirty).allowed).toBe(false);
    expect(checkRate("LOGIN", 2000, thirty.slice(1)).allowed).toBe(true);
    expect(checkRate("LOGIN", 1000 + 5 * 60 * 1000, thirty).allowed).toBe(true);
  });

  it("keeps a separate bucket per tier for the same client", () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 10; i++) limiter.check("AUTH", "AUTH:1.2.3.4", 1000 + i);
    expect(limiter.check("AUTH", "AUTH:1.2.3.4", 2000).allowed).toBe(false);
    expect(limiter.check("LOGIN", "LOGIN:1.2.3.4", 2000).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip then the first x-forwarded-for entry", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(
      clientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" })),
    ).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
