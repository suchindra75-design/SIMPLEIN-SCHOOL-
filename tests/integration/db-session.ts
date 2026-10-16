import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Direct sessions on the LOCAL Supabase database, through `docker exec` into
 * its container (the same Docker stack `npx supabase start` runs locally and
 * in CI). Used to make concurrency tests deterministic: one session holds a
 * transaction (and its row locks) open while API requests or a second
 * session run, and the test waits until the database reports them blocked.
 * Never used for hosted projects: the container only exists locally.
 */
export function localDbContainer(): string {
  const fromEnv = process.env["LOCAL_DB_CONTAINER"];
  if (fromEnv) return fromEnv;
  const config = readFileSync(path.resolve(__dirname, "../../supabase/config.toml"), "utf8");
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (projectId === undefined) throw new Error("project_id not found in supabase/config.toml");
  return `supabase_db_${projectId}`;
}

const psqlArgs = ["-U", "postgres", "-X", "-q", "-At"];

/** One-shot query as the connecting role (fixtures and assertions only). */
export function psqlQuery(sql: string): string {
  return execFileSync("docker", ["exec", "-i", localDbContainer(), "psql", ...psqlArgs, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

/** SQL that makes the rest of the transaction run as an API caller, exactly as
 *  PostgREST does for a signed-in user (role + JWT claims, transaction-local). */
export function asApiUser(authUserId: string): string {
  if (!/^[0-9a-f-]{36}$/.test(authUserId)) throw new Error("expected an auth user id");
  const claims = JSON.stringify({ sub: authUserId, role: "authenticated" });
  return `SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claims" = '${claims}';`;
}

/** Number of client sessions currently waiting on a lock whose query matches. */
export function lockWaiters(match: { applicationName?: string; queryLike?: string }): number {
  const conditions = ["wait_event_type = 'Lock'", "pid <> pg_backend_pid()"];
  if (match.applicationName !== undefined) conditions.push(`application_name = '${match.applicationName}'`);
  if (match.queryLike !== undefined) conditions.push(`query ILIKE '${match.queryLike}'`);
  return Number(psqlQuery(`SELECT count(*) FROM pg_stat_activity WHERE ${conditions.join(" AND ")}`));
}

export async function waitUntil(condition: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * A long-lived psql session. `run` sends SQL and resolves once psql has
 * executed it, with everything it printed (results and error messages).
 */
export class DbSession {
  private readonly proc: ChildProcessWithoutNullStreams;
  private output = "";
  private seq = 0;

  constructor(readonly applicationName: string) {
    // stderr is merged into stdout inside the container so errors and the
    // completion marker arrive in order on one stream.
    this.proc = spawn("docker", [
      "exec", "-i", localDbContainer(), "sh", "-c", `exec psql ${psqlArgs.join(" ")} -v ON_ERROR_STOP=0 2>&1`,
    ]);
    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.output += chunk.toString("utf8");
    });
    this.proc.stdin.write(`SET application_name = '${applicationName}';\n`);
  }

  run(sql: string, timeoutMs = 15_000): Promise<string> {
    const marker = `__done_${this.applicationName}_${++this.seq}__`;
    const start = this.output.length;
    this.proc.stdin.write(`${sql}\n\\echo ${marker}\n`);
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const at = this.output.indexOf(marker, start);
        if (at >= 0) return resolve(this.output.slice(start, at).trim());
        if (Date.now() - started > timeoutMs) return reject(new Error(`${this.applicationName}: statement timed out`));
        setTimeout(check, 10);
      };
      check();
    });
  }

  close(): void {
    this.proc.stdin.end("ROLLBACK;\n\\q\n");
  }
}
