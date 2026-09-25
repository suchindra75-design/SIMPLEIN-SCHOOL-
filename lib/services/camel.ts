/** snake_case → camelCase for API payloads (single convention at boundaries). */
function toCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function convert(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => convert(v));
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[toCamelKey(k)] = convert(v);
    }
    return out;
  }
  return value;
}

/**
 * Map a DB row payload to the service DTO. The generic is chosen by the
 * caller (see lib/services/dto.ts) — PostgREST join shapes are normalized
 * to the documented DTO, never leaked as inferred fragments.
 */
export function toCamel<T>(value: unknown): T {
  return convert(value) as T;
}
