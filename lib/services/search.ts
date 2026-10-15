/**
 * ILIKE term for free-text search inside a PostgREST `.or()` filter string.
 *
 * Search text is spliced into `col.ilike.<term>,col2.ilike.<term>`, so any
 * character PostgREST treats as syntax there — `,` `(` `)` `"` `\` — could add
 * predicates or break the filter, and `%` `_` `*` (PostgREST's alias for `%`)
 * would act as wildcards. Those characters are removed; the result is wrapped
 * in `%…%` for a contains-match. Returns null when nothing searchable remains.
 */
export function containsSearchTerm(search: string): string | null {
  const cleaned = search
    .replace(/[,()"\\%_*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned === "" ? null : `%${cleaned}%`;
}
