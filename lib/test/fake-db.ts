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
}

export interface FakeDb {
  from(table: string): FakeQuery;
  seed: Record<string, Row[]>;
  calls: RecordedCall[];
  failNext: { code: string; message: string } | null;
  callsTo(table: string, op?: RecordedCall["op"]): RecordedCall[];
}

let idCounter = 1;

export class FakeQuery {
  private filters: { col: string; op: string; val: unknown }[] = [];
  private op: RecordedCall["op"] = "select";
  private payload: unknown = undefined;
  private rangeSlice: [number, number] | null = null;
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
  upsert(payload: unknown): this {
    this.op = "upsert";
    this.payload = payload;
    return this;
  }

  private rows(): Row[] {
    return this.db.seed[this.table] ?? [];
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const v = row[f.col];
      if (f.op === "eq") return v === f.val;
      if (f.op === "neq") return v !== f.val;
      if (f.op === "in") return (f.val as unknown[]).includes(v);
      return true;
    });
  }

  private record(): void {
    this.db.calls.push({
      table: this.table,
      op: this.op,
      filters: [...this.filters],
      payload: this.payload,
    });
  }

  private consumeFailure(): { code: string; message: string } | null {
    const f = this.db.failNext;
    this.db.failNext = null;
    return f;
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
        return Promise.resolve(resolve?.({ data: [], error: null, count: null }) as TResult1);
      }
      let rows = this.rows().filter((r) => this.matches(r));
      const total = rows.length;
      if (this.rangeSlice !== null) {
        rows = rows.slice(this.rangeSlice[0], this.rangeSlice[1] + 1);
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
