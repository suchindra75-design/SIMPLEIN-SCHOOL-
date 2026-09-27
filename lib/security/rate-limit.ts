/**
 * Rate limiting (Phase 13 — now IMPLEMENTED; previously documented-only).
 *
 * In-memory sliding-window limiter, keyed per IP (+ route class). Tiers:
 * - AUTH:    /api/v1/auth/* + /api/v1/onboarding/* → 10 req / 10 min / IP
 * - WRITE:   other /api/v1/* mutations            → 120 req / min / IP
 * - READ:    other /api/v1/* reads                → 600 req / min / IP
 *
 * LIMITATION (documented in docs/SECURITY.md §7): the store is per-process
 * memory — serverless instances do not share it, so limits are approximate
 * under horizontal scaling. The `RateLimiter` interface is isolated so a
 * shared store (e.g. Upstash Redis) can replace it without touching callers.
 */

export type RateTier = "AUTH" | "WRITE" | "READ";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface TierConfig {
  limit: number;
  windowMs: number;
}

const TIERS: Record<RateTier, TierConfig> = {
  AUTH: { limit: 10, windowMs: 10 * 60 * 1000 },
  WRITE: { limit: 120, windowMs: 60 * 1000 },
  READ: { limit: 600, windowMs: 60 * 1000 },
};

/** Pure sliding-window check against a list of past timestamps. */
export function checkRate(
  tier: RateTier,
  now: number,
  pastTimestamps: readonly number[],
): RateLimitResult {
  const config = TIERS[tier];
  const windowStart = now - config.windowMs;
  const recent = pastTimestamps.filter((t) => t > windowStart);
  if (recent.length >= config.limit) {
    const oldest = Math.min(...recent);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + config.windowMs - now) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Classify a request path+method into a tier (null = no limiting). */
export function tierFor(pathname: string, method: string): RateTier | null {
  if (pathname.startsWith("/api/v1/auth/") || pathname.startsWith("/api/v1/onboarding/")) {
    return "AUTH";
  }
  if (pathname.startsWith("/api/")) {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) return "WRITE";
    return "READ";
  }
  return null; // page loads are auth-gated; not rate-limited in V1
}

/** In-memory store + check (production adapter swaps the store). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  check(tier: RateTier, key: string, now: number = Date.now()): RateLimitResult {
    const past = this.hits.get(key) ?? [];
    const result = checkRate(tier, now, past);
    if (result.allowed) {
      past.push(now);
      this.hits.set(key, past);
    }
    // GC: drop stale entries occasionally to bound memory.
    if (this.hits.size > 10000) this.sweep(now);
    return result;
  }

  private sweep(now: number): void {
    const maxWindow = Math.max(...Object.values(TIERS).map((t) => t.windowMs));
    for (const [key, times] of this.hits) {
      const recent = times.filter((t) => t > now - maxWindow);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }
}

/** Extract the client IP from proxy headers (Vercel) or the request. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
