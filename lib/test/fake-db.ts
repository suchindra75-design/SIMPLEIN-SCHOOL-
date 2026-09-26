/**
 * Programmable in-memory stand-in for the Supabase query builder.
 * Test-only: lets service tests assert tenant injection, scope filtering,
 * and write-denial WITHOUT a live database. Live RLS equivalents are
 * documented in supabase/tests/phase3_rls.sql.
 */

export type Row = Record<string, unknown>;

export interface RecordedCall {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  filters: { col: string; op: string; val: unknown }[];
  payload?: unknown;
  onConflict?: string;
}

export interface FakeDb {
  from(table: string): FakeQuery;
  seed: Record<string, Row[]>;
  calls: RecordedCall[];
  failNext: { code: string; message: string } | null;
  /** Targeted failure: fires only for the given table+op (e.g. an INSERT that
   *  violates a UNIQUE constraint later in a multi-query service call). */
  failOn: { table: string; op: RecordedCall["op"]; code: string; message: string } | null;
  /** Minimal storage stand-in: upload/sign/remove succeed; uploads recorded. */
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        bytes: unknown,
        opts?: { contentType?: string; upsert?: boolean },
      ): Promise<{ data: { path: string } | null; error: null }>;
      createSignedUrl(
        path: string,
        expires: number,
      ): Promise<{ data: { signedUrl: string } | null; error: null }>;
      remove(paths: string[]): Promise<{ error: null }>;
    };
  };
  callsTo(table: string, op?: RecordedCall["op"]): RecordedCall[];
}

let idCounter = 1;

export class FakeQuery {
  private filters: { col: string; op: string; val: unknown }[] = [];
  private op: RecordedCall["op"] = "select";
  private payload: unknown = undefined;
  private onConflict: string | undefined = undefined;
  private rangeSlice: [number, number] | null = null;
  private limitCount: number | null = null;
  private countExact = false;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(_cols?: string, opts?: { count?: "exact" }): this {
    if (opts?.count === "exact") this.countExact = true;
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push({ col, op: "eq", val });
    return this;
  }
  neq(col: string, val: unknown): this {
    this.filters.push({ col, op: "neq", val });
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }
  gte(col: string, val: unknown): this {
    this.filters.push({ col, op: "gte", val });
    return this;
  }
  lte(col: string, val: unknown): this {
    this.filters.push({ col, op: "lte", val });
    return this;
  }
  or(_cond: string): this {
    return this;
  }
  order(_col: string, _opts?: unknown): this {
    return this;
  }
  range(from: number, to: number): this {
    this.rangeSlice = [from, to];
    return this;
  }
  limit(n: number): this {
    this.limitCount = n;
    return this;
  }
  insert(payload: unknown): this {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: unknown): this {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  upsert(payload: unknown, opts?: { onConflict?: string }): this {
    this.op = "upsert";
    this.payload = payload;
    this.onConflict = opts?.onConflict;
    return this;
  }

  private rows(): Row[] {
    return this.db.seed[this.table] ?? [];
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      // Dotted columns (PostgREST embedded-resource filters) resolve by path.
      const v = f.col.includes(".")
        ? f.col
            .split(".")
            .reduce<unknown>(
              (acc, part) =>
                acc !== null && typeof acc === "object"
                  ? (acc as Row)[part]
                  : undefined,
              row,
            )
        : row[f.col];
      if (f.op === "eq") return v === f.val;
      if (f.op === "neq") return v !== f.val;
      if (f.op === "in") return (f.val as unknown[]).includes(v);
      if (f.op === "gte") return typeof v === "string" && v >= (f.val as string);
      if (f.op === "lte") return typeof v === "string" && v <= (f.val as string);
      return true;
    });
  }

  private record(): void {
    this.db.calls.push({
      table: this.table,
      op: this.op,
      filters: [...this.filters],
      payload: this.payload,
      onConflict: this.onConflict,
    });
  }

  /** Upsert semantics: match rows by the onConflict columns' payload values,
   *  update the first match or insert a new row — per payload item (batch
   *  upserts pass arrays). Returns the affected rows. */
  private applyUpsert(): Row[] {
    const payload = this.payload;
    const cols = (this.onConflict ?? "id").split(",").map((c) => c.trim());
    const rows = this.rows();
    const items = (Array.isArray(payload) ? payload : [payload]) as Row[];
    const affected: Row[] = [];
    for (const item of items) {
      const match = rows.find((r) =>
        cols.every((c) =>
          item[c] === undefined ? r[c] === undefined : r[c] === item[c],
        ),
      );
      if (match !== undefined) {
        Object.assign(match, item);
        affected.push(match);
      } else {
        const row = { id: `gen-${idCounter++}`, ...item };
        rows.push(row);
        affected.push(row);
      }
    }
    return affected;
  }

  private consumeFailure(): { code: string; message: string } | null {
    const f = this.db.failNext;
    this.db.failNext = null;
    if (f !== null) return f;
    const fo = this.db.failOn;
    if (fo !== null && fo.table === this.table && fo.op === this.op) {
      this.db.failOn = null;
      return { code: fo.code, message: fo.message };
    }
    return null;
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    this.record();
    const found = this.rows().filter((r) => this.matches(r));
    return { data: found[0] ?? null, error: null };
  }

  async single(): Promise<{ data: Row | null; error: { code: string; message: string } | null }> {
    this.record();
    const failure = this.consumeFailure();
    if (failure !== null) return { data: null, error: failure };
    if (this.op === "insert") {
      const row = { id: `gen-${idCounter++}`, ...(this.payload as Row) };
      this.rows().push(row);
      return { data: row, error: null };
    }
    if (this.op === "upsert") {
      return { data: this.applyUpsert()[0] ?? null, error: null };
    }
    const matched = this.rows().filter((r) => this.matches(r));
    if (matched.length === 0) {
      return { data: null, error: { code: "PGRST116", message: "no rows" } };
    }
    if (this.op === "update") {
      Object.assign(matched[0] as Row, this.payload as Row);
    }
    if (this.op === "delete") {
      const idx = this.rows().indexOf(matched[0] as Row);
      if (idx >= 0) this.rows().splice(idx, 1);
    }
    return { data: matched[0] ?? null, error: null };
  }

  // Thenable so `await builder` / `const { data } = await builder` works.
  then<TResult1, TResult2>(
    resolve?: (
      value: { data: Row[] | null; error: { code: string; message: string } | null; count: number | null },
    ) => TResult1 | PromiseLike<TResult1>,
    reject?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): Promise<TResult1 | TResult2> {
    try {
      this.record();
      const failure = this.consumeFailure();
      if (failure !== null) {
        return Promise.resolve(
          resolve?.({ data: null, error: failure, count: null }) as TResult1,
        );
      }
      if (this.op === "upsert") {
        const affected = this.applyUpsert();
        return Promise.resolve(
          resolve?.({ data: affected, error: null, count: null }) as TResult1,
        );
      }
      if (this.op === "insert") {
        const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
        const inserted = items.map((item) => {
          const row = { id: `gen-${idCounter++}`, ...item };
          this.rows().push(row);
          return row;
        });
        return Promise.resolve(
          resolve?.({ data: inserted, error: null, count: null }) as TResult1,
        );
      }
      if (this.op === "update") {
        const matched = this.rows().filter((r) => this.matches(r));
        for (const m of matched) Object.assign(m, this.payload as Row);
        return Promise.resolve(
          resolve?.({ data: matched, error: null, count: null }) as TResult1,
        );
      }
      if (this.op === "delete") {
        const matched = this.rows().filter((r) => this.matches(r));
        for (const m of matched) {
          const idx = this.rows().indexOf(m);
          if (idx >= 0) this.rows().splice(idx, 1);
        }
        return Promise.resolve(
          resolve?.({ data: matched, error: null, count: null }) as TResult1,
        );
      }
      let rows = this.rows().filter((r) => this.matches(r));
      const total = rows.length;
      if (this.rangeSlice !== null) {
        rows = rows.slice(this.rangeSlice[0], this.rangeSlice[1] + 1);
      } else if (this.limitCount !== null) {
        rows = rows.slice(0, this.limitCount);
      }
      return Promise.resolve(
        resolve?.({ data: rows, error: null, count: this.countExact ? total : null }) as TResult1,
      );
    } catch (e) {
      if (reject !== undefined) return Promise.resolve(reject(e));
      throw e;
    }
  }
}

export function createFakeDb(seed: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    seed: Object.fromEntries(
      Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]),
    ),
    calls: [],
    failNext: null,
    failOn: null,
    storage: {
      from(bucket: string) {
        return {
          async upload(
            path: string,
            _bytes: unknown,
            _opts?: { contentType?: string; upsert?: boolean },
          ) {
            db.calls.push({
              table: `storage:${bucket}`,
              op: "insert",
              filters: [],
              payload: { path },
            });
            return { data: { path }, error: null };
          },
          async createSignedUrl(path: string, _expires: number) {
            return {
              data: { signedUrl: `https://signed.test/${bucket}/${path}` },
              error: null,
            };
          },
          async remove(paths: string[]) {
            db.calls.push({
              table: `storage:${bucket}`,
              op: "delete",
              filters: [],
              payload: { paths },
            });
            return { error: null };
          },
        };
      },
    },
    from(table: string) {
      return new FakeQuery(db, table);
    },
    callsTo(table: string, op?: RecordedCall["op"]) {
      return db.calls.filter(
        (c) => c.table === table && (op === undefined || c.op === op),
      );
    },
  };
  return db;
}
